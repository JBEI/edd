from django.conf import settings
import json
import requests


class StudySearch(object):
    """
    A more-or-less straight port of the StudySearch.pm module from the EDD perl code. Makes requests
    to the custom Solr schema created to search EDD studies.
    
    Arguments:
        ident: User object from django.contrib.auth.models
        url: Base URL for Solr instance (default: None; overrides settings value if not None)
        settings_key: connection key in settings SOLR value
    """
    def __init__(self, ident=None, url=None, settings_key='default'):
        self.ident = ident
        if url is not None:
            self.url = url
        elif settings_key in settings.EDD_MAIN_SOLR and \
                'URL' in settings.EDD_MAIN_SOLR[settings_key]:
            self.url = settings.EDD_MAIN_SOLR[settings_key]['URL']
        else:
            self.url = 'http://localhost:8080/'

    def __str__(self, *args, **kwargs):
        return 'StudySearch[%s][%s]' % (self.url, self.ident)

    def __repr__(self, *args, **kwargs):
        return self.__str__()

    @staticmethod
    def build_acl_filter(ident):
        """
        Create a fq (filter query) string based on an ident (django.contrib.auth.models.User).
        
        Arguments:
            ident: User object from django.contrib.auth.models
        Returns:
            tuple of (read permission filter, write permission eval)
        """
        # Admins get no filter on read, and a query that will always eval true for write
        if ident.is_superuser:
            return ('', 'id:*')
        acl = ['"u:'+ident.username+'"'] + map(lambda g: '"g:'+g+'"', ident.groups.all())
        return (
            ' OR '.join(map(lambda r: 'aclr:'+r, acl)),
            ' OR '.join(map(lambda w: 'aclw:'+w, acl)),
        )

    def query(self, query='active:true', options={}):
        """
        Run a query against Solr index.
        
        Arguments:
            query: Solr query string (default: 'active:true')
            options: dict containing optional query parameters
                - edismax: boolean to run query as term in edismax query (default: False) 
                - i: starting index of results to fetch (default: 0)
                - size: maximum fetch size (default: 50)
                - sort: comma-delimited string of "field (asc|desc)" (default: None)
                - showDisabled: boolean adds a filter query for active studies (default: False)
        Returns:
            JSON results of query:
                - responseHeader
                    - status: 0 for no errors, otherwise an error code
                    - QTime: milliseconds to complete query
                    - params: echo of parameters used in request
                - response
                    - numFound: total documents matching query
                    - start: starting index of results
                    - docs: array of results
        """
        if self.ident is None:
            raise RuntimeError('No user defined for query')
        (readable, writable) = StudySearch.build_acl_filter(self.ident)
        queryopt = {
            'indent': True,
            'q': query,
            'start': options.get('i', 0),
            'rows': options.get('size', 50),
            'sort': options.get('sort', None),
            'wt': 'json',
            'fq': readable,
            'fl': '*,score,writable:exists(query({!v=\'%(aclw)s\'},0))' % {'aclw': writable},
        }
        if options.get('edismax', False):
            queryopt['defType'] = 'edismax'
            # these are the query fields and boosts to use in EDisMax
            queryopt['qf'] = ' '.join(['name^10', 'name_ng', 'description^5', 'description_ng',
                                       'contact', 'contact_ng', 'creator_email', 'creator_name',
                                       'creator_ng', 'initials', 'metabolite_name', 'protocol_name',
                                       'part_name',
                                       ])
            queryopt['q.alt'] = '*:*'
        if options.get('showDisabled'):
            queryopt['fq'] = [queryopt['fq'], 'active:true']
        response = requests.get(self.url + '/select', params=queryopt)
        if response.status_code == requests.codes.ok:
            return response.json()
        else:
            print response.url
            response.raise_for_status()

    def update(self, studies=[]):
        """
        Update Solr with given list of Study objects.
        
        Arguments:
            docs: an iterable of Study objects to update in Solr
        """
        # TODO: do some additional checking to ensure current user has write access before updating
        url = self.url + '/update/json'
        payload = map(lambda s: s.to_solr_json(), studies)
        headers = {'content-type': 'application/json'}
        response = requests.post(url, data=json.dumps(payload), headers=headers)
        if response.status_code == requests.codes.ok:
            # if the add worked, still need to send commit command
            add_json = response.json()
            response = requests.post(url, data='{"commit":{}}', headers=headers)
            if response.status_code == requests.codes.ok:
                return add_json
            else:
                raise Exception('Commit to Solr failed')
        else:
            raise Exception('Adding studies to Solr failed')

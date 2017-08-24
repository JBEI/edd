"""
Defines classes that enforce EDD object permissions in the context of Django Rest Framework.
"""
import copy
import logging

from rest_framework.permissions import BasePermission

from main.models import Study, StudyPermission

logger = logging.getLogger(__name__)


class ImpliedPermissions(BasePermission):
    """
    A custom permissions class similar DRF'S DjangoModelPermissions that allows permissions to a
    REST resource based on the following:
         1) Unauthenticated users are always denied access
         2) A user who has class-level add/change/delete django.contrib.auth permissions
            may exercise those capabilities
         3) A user who has any class-level add/change/delete django.contrib.auth
            permission granted also has implied class-level view access (though view isn't
            explicitly defined as an auth permission)
         4) If the inferred_permissions property is defined / non-empty, the existence of one or
         more results  in the queryset implies that the user has a level of inferred permission
         *only* on the objects returned by queryset. This inference should align with DRF's
         pattern of queryset filtering based on only the objects a user has access to. In most
         cases, this feature will probably only be used to infer view access to queryset results
         while avoiding a separate DB query in this class to check user permissions that are
         already checked as part of queryset result filtering.

    Client REST views that use this or derived permissions classes **must be unit tested** for
    security, since correct application of permissions depends on how the View's QuerySet
    filters results.
    """

    # django.contrib.auth permissions explicitly respected or used as the basis for interring view
    # permission. See similar (though distinct) logic in DRF's DjangoModelPermissions class.
    _AUTH_ADD_PERMISSION = '%(app_label)s.add_%(model_name)s'
    _AUTH_CHANGE_PERMISSION = '%(app_label)s.change_%(model_name)s'
    _AUTH_DELETE_PERMISSION = '%(app_label)s.delete_%(model_name)s'
    _AUTH_IMPLICIT_VIEW_PERMISSION = [_AUTH_CHANGE_PERMISSION, _AUTH_DELETE_PERMISSION]
    STANDARD_DJANGO_AUTH_PERMS_MAP = {
        'GET': _AUTH_IMPLICIT_VIEW_PERMISSION,
        'HEAD': _AUTH_IMPLICIT_VIEW_PERMISSION,
        'OPTIONS': [],  # only require user to be authenticated
        'POST': [_AUTH_ADD_PERMISSION],
        'PUT': [_AUTH_CHANGE_PERMISSION],
        'PATCH': [_AUTH_CHANGE_PERMISSION],
        'DELETE': [_AUTH_DELETE_PERMISSION],
    }

    """
    The list of permissions to infer on the specific ORM query result objects returned by the
    queryset. Accepted values are defined by QS_INFERRED_* constants attached to this class
    """
    QS_INFERRED_VIEW_PERMISSION = 'qs_view'
    QS_INFERRED_CHANGE_PERMISSION = 'qs_change'
    QS_INFERRED_DELETE_PERMISSION = 'qs_delete'
    QS_INFERRED_ADD_PERMISSION = 'qs_add'
    DEFAULT_METHOD_TO_INFERRED_PERM_MAP = {
        'GET': QS_INFERRED_VIEW_PERMISSION,
        'HEAD': QS_INFERRED_VIEW_PERMISSION,
        'OPTIONS': QS_INFERRED_VIEW_PERMISSION,
        'POST': QS_INFERRED_ADD_PERMISSION,
        'PUT': QS_INFERRED_CHANGE_PERMISSION,
        'PATCH': QS_INFERRED_CHANGE_PERMISSION,
        'DELETE': QS_INFERRED_DELETE_PERMISSION,
    }

    def __init__(self):
        # copy default permission maps so they can be modified if needed for special-purpose use
        # (e.g. in SearchView)
        self.django_perms_map = copy.copy(self.STANDARD_DJANGO_AUTH_PERMS_MAP)
        self.method_to_inferred_perms_map = copy.copy(self.DEFAULT_METHOD_TO_INFERRED_PERM_MAP)

        # optional implied add/change/view permissions on the specific objects returned by the
        # queryset
        self.result_implied_permissions = [self.QS_INFERRED_VIEW_PERMISSION]

    @classmethod
    def get_standard_enabling_permissions(cls, http_method, orm_model_cls):
        return cls.build_permission_codes(cls.STANDARD_DJANGO_AUTH_PERMS_MAP[http_method],
                                          orm_model_cls)

    def get_enabling_permissions(self, http_method, orm_model_cls):
        """
        Given a model class and an HTTP method, return the list of permission
        codes that enable the user to access this resource (having any of them will permit access)
        """
        return self.build_permission_codes(self.django_perms_map[http_method], orm_model_cls)

    @staticmethod
    def build_permission_codes(perm_code_patterns, orm_model_cls):
        """
            Given a model class and a a list of django.util.auth permission code
            patterns, builds the list of django.util.auth permission codes that enable the user
             to access this resource (having any of them will permit access)
        """
        kwargs = {
            'app_label':  orm_model_cls._meta.app_label,
            'model_name': orm_model_cls._meta.model_name
        }
        return [perm % kwargs for perm in perm_code_patterns]

    def has_permission(self, request, view):
        # Workaround to ensure DjangoModelPermissions are not applied
        # to the root view when using DefaultRouter.
        if getattr(view, '_ignore_model_permissions', False):
            return True

        http_method = request.method
        user = request.user

        # unauthenticated users never have permission
        if not (user and user.is_authenticated()):
            logger.debug(
                '%(class)s: User %(username)s is not authenticated. Denying access to '
                '%(url)s' % {
                    'class': ImpliedPermissions.__class__.__name__,
                    'username': user.username,
                    'url': request.path,
                })
            return False

        if request.method == 'OPTIONS':
            return True

        # get the queryset, depending on how the view defines it
        if hasattr(view, 'get_queryset'):
            queryset = view.get_queryset()
        else:
            queryset = getattr(view, 'queryset', None)

        assert queryset is not None, ('Cannot apply permissions on a view that '
                                      'does not set `.queryset` or have a `.get_queryset()` '
                                      'method. View "%(view)s" does not have either' % {
                                          'view': view.__class__.__name__})
        #########################################################

        if user_has_admin_or_manage_perm(request, queryset.model, self.get_enabling_permissions):
            return True

        # if we can't infer permission and don't have any explicitly-defined permission,
        # accesss is DENIED
        if not self.result_implied_permissions:
            logger.debug('%(class)s: User %(username)s has no explicitly-granted permissions on '
                         'resource %(url)s. Denying access since no inferred permissions are '
                         'defined for HTTP %(method)s.' % {
                            'class': ImpliedPermissions.__class__.__name__,
                            'username': user.username,
                            'method': request.method,
                            'url': request.path,
                         })
            return False

        # note: we'll just return an empty ResultSet, but still tell the user they have access to
        # the resource since it would be confusing for the return code to change based solely on
        # the addition of a database record
        requested_permission = self.method_to_inferred_perms_map[http_method]
        permission_implied_by_results = requested_permission in self.result_implied_permissions

        logger.debug('%(class)s: Queryset inferred permissions: (%(perms)s)' % {
            'class': ImpliedPermissions.__class__.__name__,
            'perms': ', '.join(self.result_implied_permissions)})

        has = 'has' if permission_implied_by_results else "doesn't have"
        logger.debug('%(class)s: User %(username)s %(has)s inferred permission %(permission)s on '
                     'resource %(method)s %(url)s if the query returns results' % {
                        'class': ImpliedPermissions.__class__.__name__,
                        'username': user.username,
                        'has': has,
                        'permission': requested_permission,
                        'method': request.method,
                        'url': request.path, })

        # make mutation attempts consistently return 403 instead of 404 for logged in users (DRF
        #  does this automatically for much of EDD's API)
        existing_record_mutator_methods = ('PUT', 'PATCH', 'DELETE')
        if http_method in existing_record_mutator_methods and not len(queryset):
            return False

        return permission_implied_by_results


HTTP_TO_STUDY_PERMISSION_MAP = {
    'POST': StudyPermission.WRITE,
    'PUT': StudyPermission.WRITE,
    'DELETE': StudyPermission.WRITE,
    'PATCH': StudyPermission.WRITE,
    'OPTIONS': StudyPermission.NONE,
    'HEAD': StudyPermission.READ,
    'GET': StudyPermission.READ,
}


def get_requested_study_permission(http_method):
    return HTTP_TO_STUDY_PERMISSION_MAP.get(http_method.upper())


def user_has_admin_or_manage_perm(
        request, result_model_class,
        perms_getter=ImpliedPermissions.get_standard_enabling_permissions):
    """
        A helper method to enforce user role based or class-level django.contrib.auth permissions.
        In the default configuration, if this method returns without raising an Exception, the user
        has the permission to access all instances of model_class for operations dictated by
        request.method.
        : raise PermissionDenied if the user doesn't have role-based or django.contrib.auth
        permission
        to access all instances of result_model_class. Not raised if suppress_perm_exception is
        True.
        :returns: True if the user has the required permission on all instances of
        result_model_class,
        False otherwise.  Note that unless suppress_perm_exception is True, this function will
        always
        raise an Exception instead of returning False.
        :raises NotAuthenticated: if the requesting user isn't authenticated.  This Exception
        cannot
        be suppressed.
        """
    user = request.user
    http_method = request.method
    requested_perm = get_requested_study_permission(request.method)

    # superusers users always have permission
    if user.is_superuser:
        logger.debug('User %(username)s is a superuser.  Allowing access to %(method)s '
                     '%(url)s' % {
                         'username': user.username, 'method': request.method, 'url': request.path,
                     })
        return True

    # if user has been explicitly granted any of the class-level django.contrib.auth permissions
    # that enable access
    enabling_perms = perms_getter(http_method, result_model_class)
    for auth_perm in enabling_perms:
        if user.has_perm(auth_perm):
            logger.debug('User %(user)s has %(method)s ("%(perm)s") permission for '
                         'all %(model_class)s objects implied via the "%(auth_perm)s" '
                         'auth permission' % {
                             'user': user.username,
                             'method': request.method,
                             'model_class': result_model_class.__name__,
                             'perm': requested_perm,
                             'auth_perm': auth_perm,
                         })
            return True

    if logger.level == 'DEBUG':
        logger.debug('User %(user)s has does NOT have %(method)s ("%(study_perm)s") permission '
                     'for all %(model_class)s objects. Granting django.contrib.auth '
                     'permissions would be the any of (%(auth_perm)s)' % {
                         'user': user.username,
                         'method': request.method,
                         'model_class': result_model_class.__name__,
                         'study_perm': requested_perm,
                         'auth_perm': ', '.join(['"%s"' % perm for perm in enabling_perms])})
    return False


class StudyResourcePermissions(ImpliedPermissions):
    """
    A permissions class specifically for use in /rest/studies/, but NOT in nested resources.
    Applies object-level Study permissions for users/groups, class-level Study
    django.contrib.auth permissions, and EDD application-level study creation permissions.
    """

    def __init__(self):
        super(StudyResourcePermissions, self).__init__()

        # override default view-only permission granted as a result of the queryset returning
        # results.  TODO: we'll need to add 'delete' here too once it's implemented in the view
        self.result_implied_permissions = [self.QS_INFERRED_VIEW_PERMISSION,
                                           self.QS_INFERRED_CHANGE_PERMISSION]

    def has_permission(self, request, view):

        # override base permission to allow all authenticated users to create studies, except when
        # explicitly disabled
        user = request.user

        if (not user) or (not user.is_authenticated()):
            logger.debug('StudyResourcePermission: User %s is not authenticated' % str(user))
            return False

        if request.method == 'POST':
            return Study.user_can_create(user)

        return super(StudyResourcePermissions, self).has_permission(request, view)

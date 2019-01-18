import uuid

from django.views import generic

from main.models.permission import StudyPermission
from main.views import load_study, StudyObjectMixin


class ImportView(StudyObjectMixin, generic.DetailView):
    template_name = 'edd_file_importer/import2.html'

    def get_context_data(self, **kwargs):
        context = super(ImportView, self).get_context_data(**kwargs)
        # create a UUID for the import about to be performed.  Avoids potential for race conditions
        # in initial DB record creation & file processing that happen in separate containers
        context['uuid'] = uuid.uuid4()
        return context

    def get(self, request, *args, **kwargs):
        # load study to enforce permissions check... permissions should also be checked by back end
        # during user attempt to create the lines, but better to identify permissions errors before
        # loading the form
        pk = kwargs.get('pk', None)
        slug = kwargs.get('slug', None)
        load_study(request, pk=pk, slug=slug, permission_type=StudyPermission.CAN_EDIT)

        # render the template
        return super(ImportView, self).get(request, *args, **kwargs)

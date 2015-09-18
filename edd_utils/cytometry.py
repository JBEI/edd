
import logging

from main.models import Assay, Line


logger = logging.getLogger(__name__)


def load_assay_for(request, i, study):
    qd = request.POST
    assay_id = qd.get('assay%s' % i, None)
    if assay_id == 'new':
        line_id = qd.get('line%s' % i, None)
        sample_name = qd.get('sample%s' % i, None)
        if line_id == 'new' and study:
            line = study.line_set.create(
                name='Imported %s' % (study.line_set.count() + 1),
                contact=request.user,
                experimenter=request.user,
                )
        elif line_id:
            line = Line.objects.get(pk=line_id)
        if line:
            assay = line.assay_set.create(
                name='%s-%s' % (line.name, sample_name),
                protocol=None, # TODO need to get cytometry protocol
                experimenter=request.user,
                )
    elif assay_id == 'ignore':
        assay = None
    elif assay_id:
        assay = Assay.objects.get(pk=assay_id)
    return assay


class CytometerImport(object):
    """ Object to handle processing of data POSTed to /utilities/cytometry/import view and add
        measurements to the database. """

    def __init__(self, request):
        self._request = request
        self._qd = request.POST
        self._rows = {}

    def process_row(self, i, row, assay):
        obj = CytometerRow(assay)
        for (j, cell) in row:
            # look up how to handle column j, add to obj
            self.process_cell(j, cell, obj)
        self._rows[i] = obj

    def process_cell(self, j, cell, obj):
        col = self._qd.get('column%s' % j, None)
        if col == 'avg':
            obj.define_measurement(j, self._qd.get('type%s' % j, None), cell)
        elif col == 'std':
            obj.define_deviation(self._qd.get('std%s' % j, None), cell)
        elif col == 'cv':
            obj.define_variance(self._qd.get('cv%s' % j, None), cell)
        elif col == 'count':
            obj.define_count(cell)
        elif col == 'meta':
            obj.define_metadata(self._qd.get('meta%s' % j, None), cell)
        elif col == 'viab':
            obj.define_viable(cell)


class CytometerRow(object):
    def __init__(self, assay):
        self._assay = assay

    def compose(self):
        pass

    def define_count(self, value):
        pass

    def define_deviation(self, seq, value):
        pass

    def define_measurement(self, seq, ptype, value):
        pass

    def define_metadata(self, meta_type, value):
        self._assay.meta_store[meta_type] = value

    def define_variance(self, seq, value):
        pass

    def define_viable(self, value):
        pass

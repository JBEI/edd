"""
Sets up standard lists of Categories in the edd.load app, and Protocols in the
main app, for use in ABF and JBEI projects at ESE.
"""

from django.core.management.base import BaseCommand
from django.db.models import Max
from django.utils.translation import gettext_lazy as _

from edd.load import models as load_models
from main import models as main_models

_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_CSV = "text/csv"

# if adding to this, order matters, new items at end of category sections!
CATEGORIES = {
    "Bioreactor": {
        "Biolector": {
            "uuid": "0554be0b-30bc-45e4-97a0-c87dd0463960",
        },
        "AMBR250": {
            "uuid": "7cd34d6d-8cb5-48f3-9da1-409be9ccdcda",
        },
        "RAMOS": {
            "uuid": "334243d5-ec12-4b0c-aab5-da5d5d18d49e",
        },
    },
    "Omics": {
        "Transcriptomics": {
            "uuid": "59a2d2df-515b-408c-b4a9-51dfbc66a028",
        },
        "RNA-seq": {
            "uuid": "b5ff1485-7f1c-471f-95a9-b8e849b47446",
        },
        "Global Proteomics": {
            "uuid": "759a9941-608b-42c7-9136-bb4f7ed704e1",
        },
        "Targeted Proteomics": {
            "uuid": "b5cf3c91-d0d5-4c72-afe3-cf9eabd1cd73",
        },
        "Global Metabolomics": {
            "uuid": "ef277957-f086-4ced-b060-c9e7c1e23021",
        },
        "Targeted Metabolomics": {
            "uuid": "848fe50c-f680-4621-b93d-bd5ad4b6b33a",
        },
        "Global Lipidomics": {
            "uuid": "7fd9d666-541b-4797-8e9c-c8e3da8580f0",
        },
        "Targeted Lipidomics": {
            "uuid": "79f3d00e-7166-4b10-bc67-20a0c0955c0a",
        },
        "13C-MFA": {
            "uuid": "087df0df-4d23-461c-9ff8-207dd30ed487",
        },
    },
    "Small Molecule Analysis": {
        "GC-FID": {
            "uuid": "ee08e873-f568-48b9-b022-f7a8af58fa17",
        },
        "GC-MS": {
            "uuid": "d5c57418-9871-47ec-a645-e207cbf899bd",
        },
        "HPLC": {
            "uuid": "928d93b9-3233-4a6f-9842-799e2dc640ce",
        },
        "LC-MS": {
            "uuid": "e78b3494-2cfd-45d9-8213-507c6023a004",
        },
        "CE-MS": {
            "uuid": "de0501fc-f63b-429c-b2d3-c35ca8f6cbcb",
        },
        "Thermo Gallery Analyzer": {
            "uuid": "51e626d2-89b6-405e-9076-e51827821f25",
        },
        "HPAEC": {
            "uuid": "38fd860d-0e88-465e-88c2-25fa48c54834",
        },
        "NIMS": {
            "uuid": "de8961a7-bd37-458b-bd12-cc2d649706e7",
        },
    },
    "Other": {
        "UV/vis/fluorescence Plate Reader": {
            "uuid": "b734df5c-f806-4c63-a3df-13c1e493b411",
        },
        "Flow Cytometry": {
            "uuid": "0be343d9-634d-42b3-811c-e49f51005031",
        },
        "Optical Density": {
            "uuid": "8c5e4f8c-3812-46f1-9d00-235f983ca935",
        },
        "QPCR": {
            "uuid": "019609cd-f1e4-41d1-8187-776169d1bb91",
        },
        "Other": {
            "uuid": "0667f8cb-e3a7-409c-bd5a-8a4054714d67",
        },
    },
}
LAYOUTS = {
    "Ambr": {
        _EXCEL: "edd.load.parsers.AmbrExcelParser",
    },
    "Generic": {
        _CSV: "edd.load.parsers.GenericCsvParser",
        _EXCEL: "edd.load.parsers.GenericExcelParser",
    },
    "Skyline": {
        _CSV: "edd.load.parsers.SkylineCsvParser",
        _EXCEL: "edd.load.parsers.SkylineExcelParser",
    },
}
CAT_LAYOUTS = {
    "Bioreactor": ["Ambr", "Generic"],
    "Omics": ["Generic", "Skyline"],
    "Small Molecule Analysis": ["Generic"],
    "Other": ["Generic"],
}


class Command(BaseCommand):
    help = _("Sets up standard Category and Protocol records for the ESE facility")

    def handle(self, *args, **options):
        # setup layouts
        for name, mapping in LAYOUTS.items():
            layout, _created = load_models.Layout.objects.get_or_create(
                defaults={"description": ""},
                name=name,
            )
            for mime, parser in mapping.items():
                parser, _created = load_models.ParserMapping.objects.get_or_create(
                    defaults={"parser_class": parser},
                    layout=layout,
                    mime_type=mime,
                )
        # get_or_create each of the categories
        start = load_models.Category.objects.aggregate(sort=Max("sort_key"))["sort"]
        for sort, (name, c) in enumerate(CATEGORIES.items(), start=start + 1):
            category, _created = load_models.Category.objects.get_or_create(
                defaults={"sort_key": sort},
                name=name,
            )
            # get_or_create each of the protocols
            for psort, (pname, p) in enumerate(c.items(), start=1):
                protocol, _created = main_models.Protocol.objects.get_or_create(
                    defaults={"name": pname},
                    uuid=p["uuid"],
                )
                link, _created = load_models.CategoryProtocol.objects.get_or_create(
                    defaults={"category": category, "sort_key": psort},
                    protocol=protocol,
                )
            # apply layouts
            for lsort, layout_name in enumerate(CAT_LAYOUTS[name], start=1):
                layout = load_models.Layout.objects.get(name=layout_name)
                load_models.CategoryLayout.objects.get_or_create(
                    defaults={"sort_key": lsort},
                    category=category,
                    layout=layout,
                )

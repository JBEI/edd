from .. import forms
from . import factory


def test_MetadataEditMixin_process_strings():
    mem = forms.MetadataEditMixin()
    meta = {"1": "some text", "2": "delete"}

    updating, removing = mem.process_metadata_inputs(meta)

    assert len(updating) == 2
    assert updating["1"] == "some text"
    assert updating["2"] == "delete"
    assert len(removing) == 0


def test_MetadataEditMixin_process_non_strings():
    mem = forms.MetadataEditMixin()
    meta = {"1": False, "2": 42, "3": {"complex": "dict"}}

    updating, removing = mem.process_metadata_inputs(meta)

    assert len(updating) == 3
    assert updating["1"] is False
    assert updating["2"] == 42
    assert updating["3"] == {"complex": "dict"}
    assert len(removing) == 0


def test_MetadataEditMixin_process_removal():
    mem = forms.MetadataEditMixin()
    meta = {"1": "some text", "2": {"delete": True}}

    updating, removing = mem.process_metadata_inputs(meta)

    assert len(updating) == 1
    assert updating["1"] == "some text"
    assert len(removing) == 1
    assert "2" in removing


def test_LineForm_boolean_toggle_on(db):
    line = factory.LineFactory(control=False)
    # default form to existing data
    data = forms.LineForm.initial_from_model(line, prefix="line")
    # flip the checkbox for control
    data["line-control"] = True
    form = forms.LineForm(data, instance=line, prefix="line", study=line.study)
    form.save()
    # verify the saved line is now a control
    assert line.control


def test_LineForm_boolean_toggle_off(db):
    line = factory.LineFactory(control=True)
    # default form to existing data
    data = forms.LineForm.initial_from_model(line, prefix="line")
    # remove field for control
    del data["line-control"]
    form = forms.LineForm(data, instance=line, prefix="line", study=line.study)
    form.save()
    # verify the saved line is now NOT a control
    assert not line.control

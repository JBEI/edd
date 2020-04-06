from main import forms


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

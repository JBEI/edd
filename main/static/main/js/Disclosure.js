var Disclose;
Disclose = {
    click: function (n) {
        var showTheseString = n.getAttribute("showthese");
        var hideTheseString = n.getAttribute("hidethese");

        if (showTheseString || hideTheseString) {
            if (showTheseString) {
                var showList = showTheseString.split(',');
                for (var objIndex = 0; objIndex < showList.length; objIndex++) {
                    var objName = showList[objIndex];
                    objName = objName.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                    var oneObj = document.getElementById(objName);
                    if (oneObj) {
                        oneObj.style.visibility = 'visible';
                        $(oneObj).removeClass('off');
                    }
                }
            }

            if (hideTheseString) {
                var hideList = hideTheseString.split(',');
                for (var objIndex = 0; objIndex < hideList.length; objIndex++) {
                    var objName = hideList[objIndex];
                    objName = objName.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
                    var oneObj = document.getElementById(objName);
                    if (oneObj) {
                        $(oneObj).addClass('off');
                        oneObj.style.visibility = 'hidden';
                    }
                }
            }
        }
    },
    disclosedHelpForFirstTime: function () {
        var url = "/PreferencesAjaxResp.cgi?action=disclosedHelpForFirstTime";
        $.ajax({
            url: url,
            dataTypeString: "json",
            success: function (data, textStatus, jqXHR) {
            }
        });
    }
};

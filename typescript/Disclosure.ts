var Disclose:any;
Disclose  = {

	click:function(n) {

		// If either of these are present, refer to them for what to hide AND show.
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


	disclosedHelpForFirstTime:function() {

		// Build an AJAX URL containing the required action
		var url = "/PreferencesAjaxResp.cgi?action=disclosedHelpForFirstTime";
		$.ajax({
			url: url,
			dataTypeString: "json",
			success: function(data, textStatus, jqXHR) {
	//				receiveData(data, textStatus, jqXHR);	// No response needed
				}
		});
	}
};
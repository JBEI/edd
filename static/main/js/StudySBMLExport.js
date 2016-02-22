// Locate the necessary form element for tracking whether a
// section of the Assays table has been disclosed, and write a value there.
function trackShown(fid, val) {
    var el = document.getElementById(fid);
    if (el) {
        el.value = val;
    }
}
// Set the page's form for downloading, embed the given timestamp, and submit the form.
function submitForSBMLDownload(ts) {
    var del = document.getElementById('downloadflag');
    if (del) {
        del.value = 1;
    }
    var tsel = document.getElementById('downloadtimestamp');
    if (tsel) {
        tsel.value = ts;
    }
    var exForm = document.getElementById("exportForm");
    if (exForm) {
        exForm.submit();
    }
}
// Set the page's form for downloading, embed the given timestamp, and submit the form.
function submitForRefresh() {
    var del = document.getElementById('downloadflag');
    if (del) {
        del.value = 0;
    }
    var wait = document.getElementById('templateWaitBadge');
    if (wait) {
        wait.className = "waitbadge wait";
    }
    var exForm = document.getElementById("exportForm");
    if (exForm) {
        exForm.submit();
    }
}

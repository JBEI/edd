//call click event functions

 $(function () {
      //i'm not sure where to put this code. appending add new line button/modal to lines table
     $('#line_worklist').attr('title', 'select line(s) first');
     $('#line-export').attr('title', 'select line(s) first');

     lineModal();
     assayModal();
     measurementToAssayModal();
     addNewLineModal();
     addNewLineModal2();
     editLineModal();
     generateWorkList();
     showStudyGraph();
     showStudyTable();
     whatIsALine();
    });

//click handler for export modal
function lineModal(event) {
   var dlg = $("#line-popup").dialog({
       autoOpen: false
    });
    $("#line-export").click(function() {
       $("#line-popup").dialog( "open" );
        return false;
    });
    dlg.parent().appendTo('#line-action-form');
    return false;
};

//click handler for adding assay to line
function assayModal(event) {
   var dlg = $("#assayMain").dialog({
       autoOpen: false
    });
    $("#addAssayToLine").click(function() {
       $("#assayMain").dialog( "open" );
        return false;
    });
    return false;
};

//click handler for add measurements to selected assays modal
function measurementToAssayModal(event) {
   var dlg = $("#addMeasToAssay").dialog({
       autoOpen: false
    });
    $("#measurementMain").click(function() {
       $("#addMeasToAssay").dialog( "open" );
        return false;
    });
    return false;
};

//click handler for adding new line
function addNewLineModal(event) {
   var dlg = $("#addNewLineForm").dialog({
       autoOpen: false
    });
    $("#addNewLine").click(function() {
       $("#addNewLineForm").dialog( "open" );
        return false;
    });
    return false;
};

//click handler for second add new line button
function addNewLineModal2(event) {
   var dlg = $("#addNewLineForm").dialog({
       autoOpen: false
    });
    $("#addNewLineNoLines").click(function() {
       $("#addNewLineForm").dialog( "open" );
        return false;
    });
    return false;
};

//click handler for editing line
function editLineModal(event) {
   var dlg = $("#editLineForm").dialog({
       autoOpen: false
    });
    $("#editLineButton").click(function() {
       $("#editLineForm").dialog( "open" );
        return false;
    });
    return false;
};

//work around for generating worklist click handler
function generateWorkList() {
    $('#line_worklist').click(function () {
        $('select[name="export"]').val('worklist');
        var test = $('button[value="line_action"]')[1];
        $(test).click();
    });
}

//show hide for clicking graph tab under data
function showStudyGraph() {
    $('#studyGraph').click(function (event) {
        event.preventDefault();
        $('#assaysSection').prev().hide()
        $('#studyTable').removeClass('active');
        $(this).addClass('active');
        $('#overviewSection').css('display', 'block');
        $('#assaysSection').css('display', 'none');
        return false
    });
}

//show hide for clicking table tab under data
function showStudyTable() {
    $( "#studyTable" ).one( "click", function() {
    StudyD.assaysDataGrids.triggerAssayRecordsRefresh();
    });
    $('#studyTable').click(function (event) {
          event.preventDefault();
          //$('#assaysSection').prev().show();
          $('#studyGraph').removeClass('active');
          $(this).addClass('active');
          $('#assaysSection').css('display', 'block');
          $('#overviewSection').css('display', 'none');
          return false
      });
  };

//show hide for what is a line description
function whatIsALine() {
    $('#show').click(function (event) {
          event.preventDefault();
          $(this).val() == "show" ? show_int() : show_hide();
          return false
      });
}

function show_int() {
    $('#show').val("hide");
    $('#lineDescription').css('display', 'block');
}

function show_hide() {
    $('#show').val("show");
    $('#lineDescription').css('display', 'none');
}

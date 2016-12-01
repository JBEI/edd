//call click event functions

 $(function () {
     lineModal();
     assayModal();
     measurementToAssayModal();
     addNewLineModal();
     filteringSectionSlideDown();
     generateWorkList();
     showLines();
     showDataDiv();
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

//click handler for filtering section
function filteringSectionSlideDown(event) {
    $(document).on('click', '.caret', function () {
               $("#mainFilterSection").slideDown(500);
                return false;
            });
        };

//work around for generating worklist click handler
function generateWorkList() {
    $('#line_worklist').click(function () {
        $('select[name="export"]').val('worklist')
        var test = $('button[value="line_action"]')[1];
        $(test).click();
    });
}

//show hide divs clicking lines button
function showLines() {
    $('#linesTab').click(function (event) {
        event.preventDefault();
        $('#overviewTab').removeClass('active');
        $('#dataTab').removeClass('active');
        $(this).addClass('active');
        $('#dataDisplay').css('display', 'none');
        $('#measurementMain').css('display', 'none');
        $('.line-action').css('display', 'block');
        // $('#addNewLine').css('display', 'block'); hiding this for now until we figure out where to add it
    });
}
//show hide divs clicking data button
function showDataDiv() {
    $('#dataTab').click(function (event) {
        event.preventDefault();
        $('#overviewTab').removeClass('active');
        $('#linesTab').removeClass('active');
        $(this).addClass('active');
        $('#dataDisplay').css('display', 'block');
        $('#measurementMain').css('display', 'inline-block');
        $('.line-action').css('display', 'none');
        //$('#addNewLine').css('display', 'none') see above
    });
}

//show hide for clicking graph tab under data
function showStudyGraph() {
    $('#studyGraph').click(function (event) {
        event.preventDefault();
        // $('#assaysSection').prev().hide()
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
          //StudyD.assaysDataGrids.triggerAssayRecordsRefresh();
          // $('#assaysSection').prev().show();
          $('#studyGraph').removeClass('active');
          $(this).addClass('active');
          $('#assaysSection').css('display', 'block');
          $('#overviewSection').css('display', 'none');
          return false
      });
  };

//show hide for what is a line description
function whatIsALine() {
    $('#hide').click(function (event) {
          event.preventDefault();
          $(this).val() == "hide" ? show_int() : show_hide();
          return false
      });
}

function show_int() {
    $('#hide').val("show");
    $('#lineDescription').css('display', 'none');
}

function show_hide() {
    $('#hide').val("hide");
    $('#lineDescription').css('display', 'block');
}

 $(function(event) {
           var dlg = $( "#line-popup" ).dialog({
               autoOpen: false
            });
            $( "#line-export" ).click(function() {
               $("#line_action_export" ).prop("checked", true);
               $( "#line-popup" ).dialog( "open" );
                return false;
            });
     dlg.parent().appendTo('#line-action-form');
     return false;
         });

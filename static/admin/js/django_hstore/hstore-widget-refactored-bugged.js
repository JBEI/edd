// TODO:
// this should be refactored as a jQuery plugin
var djangoHstoreWidget = {
    
    addRow: function($hstore, params){
        var template_data = django.jQuery.extend({
                'key': '',
                'value': '',
                'type': typeof type === 'undefined' ? 'text' : type,
                'key_disabled': false,
                'readonly': false
            }, params),
            // cache other objects that we'll reuse
            empty_row = _.template(this.row_html, template_data);
        // append row
        $hstore.find('.hstore-rows').append(empty_row);
    },
    
    // reusable function that retrieves a template even if ID is not correct
    // (written to support inlines)
    retrieveTemplate: function(template_name, field_name){
        var specific_template = $('#'+template_name+'-'+field_name);
        // if found specific template return that
        if(specific_template.length){
            return specific_template.html();
        }
        else{
            // get fallback template
            var html = django.jQuery('.'+template_name+'-inline').html();
            return html;
        }
    },
    
    // reusable function that compiles the UI
    compileUI: function(params){
        var hstore_field_name = this.hstore_field_name,
            hstore_field_id = 'id_'+hstore_field_name,
            original_textarea = $('#'+hstore_field_id),
            original_container = original_textarea.parents('.form-row, .grp-row').eq(0),
            json_data = {},
            self = this;
        
        // manage case in which textarea is blank with try/catch
        try{
            json_data = JSON.parse(original_textarea.val());
        }
        catch(e){}
        
        var hstore_field_data = {
                "id": hstore_field_id,
                "label": original_container.find('label').text(),
                "name": hstore_field_name,
                "value": original_textarea.val(),
                "help": original_container.find('.grp-help, .help').text(),
                "data": json_data
            },
            // compile template
            ui_html = self.retrieveTemplate('hstore-ui-template', hstore_field_name),
            compiled_ui_html = _.template(ui_html, hstore_field_data);
        
        // this is just to DRY up a bit
        if(params && params.replace_original === true){
            // remove original textarea to avoid having two textareas with same ID
            original_textarea.remove();
            // inject compiled template and hide original
            original_container.after(compiled_ui_html).hide();
        }
        
        return compiled_ui_html;
    },
    
    // reusable function that updates the textarea value
    updateTextarea: function(container) {
        // init empty json object
        var new_value = {},
            raw_textarea = container.find('textarea'),
            rows = container.find('.form-row, .grp-row');
    
        // loop over each object and populate json
        rows.each(function() {
            var inputs = $(this).find('input'),
                key = inputs.eq(0).val(),
                value = inputs.eq(1).val();
            new_value[key] = value;
        });
    
        // update textarea value
        $(raw_textarea).val(JSON.stringify(new_value, null, 4));
    },
    
    init: function(hstore_field_name){
        
        $ = django.jQuery;
        
        var self = this;
        self.hstore_field_name = hstore_field_name;
        self.row_html = self.retrieveTemplate('hstore-row-template', this.hstore_field_name);
        
        // ignore inline templates
        // if hstore_field_name contains "__prefix__"
        if(hstore_field_name.indexOf('__prefix__') > -1){
            return;
        }
        
        // generate initial UI
        self.compileUI({ replace_original: true });
        
        // cache other objects that we'll reuse
        var row_html = self.retrieveTemplate('hstore-row-template', hstore_field_name),
            empty_row = _.template(row_html, { 'key': '', 'value': '', 'type': 'text' }),
            $hstore = $('#id_'+hstore_field_name).parents('.hstore');
        
        // remove row link
        $hstore.delegate('a.remove-row', 'click', function(e) {
            e.preventDefault();
            // cache container jquery object before $(this) gets removed
            $(this).parents('.form-row, .grp-row').eq(0).remove();
            self.updateTextarea($hstore);
        });
        
        // add row link
        $hstore.delegate('a.add-row, .add-row a', 'click', function(e) {
            e.preventDefault();
            self.addRow($hstore);
        });
        
        // toggle textarea link
        $hstore.delegate('.hstore-toggle-txtarea', 'click', function(e) {
            e.preventDefault();
            
            var raw_textarea = $hstore.find('.hstore-textarea'),
                hstore_rows = $hstore.find('.hstore-rows'),
                add_row = $hstore.find('.add-row');
            
            if(raw_textarea.is(':visible')) {
                // try to compile ui
                try{
                    var compiled_ui = self.compileUI();
                }
                // fail because invalid json?
                catch(e){
                    alert('invalid JSON:\n'+e);
                    return;
                }
                // filter only relevant content
                try{
                    var $ui = $(compiled_ui);
                }
                // jquery > 1.8
                catch(e){
                    var $ui = $($.parseHTML(compiled_ui));
                }
                hstore_rows.html($ui.find('.hstore-rows').html());
            
                raw_textarea.hide();
                hstore_rows.show();
                add_row.show();
            }
            else{
                raw_textarea.show();
                hstore_rows.hide();
                add_row.hide();
            }
        });
        
        // update textarea whenever a field changes
        $hstore.delegate('input[type=text]', 'keyup', function() {
            self.updateTextarea($hstore);
        });
    }
};

django.jQuery(window).load(function() {
    // support inlines
    // bind only once
    if(window.hstoreWidgetBoundInlines === undefined){
        $('.grp-group .grp-add-handler, .inline-group .add-row a').click(function(e){
            var hstore_original_textareas = $(this).parents('.grp-group, .inline-group').eq(0).find('.hstore-original-textarea');
            // if module contains .hstore-original-textarea
            if(hstore_original_textareas.length > 0){
                // loop over each inline
                $(this).parents('.grp-group, .inline-group').find('.grp-items div.grp-dynamic-form, .inline-related').each(function(e, i){
                    // loop each textarea
                    $(this).find('.hstore-original-textarea').each(function(e, i){
                        // cache field name
                        var field_name = $(this).attr('name');
                        // ignore templates
                        // if name attribute contains __prefix__
                        if(field_name.indexOf('prefix') > -1){
                            // skip to next
                            return;
                        }
                        djangoHstoreWidget.init(field_name);
                    });
                });
            }
        });
        window.hstoreWidgetBoundInlines = true;
    }
});
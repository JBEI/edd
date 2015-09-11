
jQuery(function ($) {
    var _dropzone, _textarea;
    // http://stackoverflow.com/questions/22063612
    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
      jqXHR.setRequestHeader('X-CSRFToken', jQuery.cookie('csrftoken'));
    });
    _textarea = $('#id_rawtext');
    _dropzone = new Dropzone(_textarea[0], { 'url': '/utilities/cytometry/parse/' });
    _dropzone.on('sending', function (event, xhr, formdata) {
        xhr.setRequestHeader("X-CSRFToken", $.cookie('csrftoken'));
    }).on('success', function (file, response) {
        if (response.python_error) {
            window.alert(response.python_error);
        } else {
            _textarea.val(response.data);
        }
    });
});

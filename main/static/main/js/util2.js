
/*

Miscellaneous utilities (native JavaScript)

*/

function setupFileDrop (element_id, url, process_result, multiple) {
  var zone = new FileDrop(element_id, {});
  var csrftoken = jQuery.cookie('csrftoken');
  if (! (typeof multiple === "undefined")) {
    zone.multiple(multiple);
  } else {
    zone.multiple(false);
  }
  zone.event('send', function (files) {
    files.each(function (file) {
      file.event('done', function (xhr) {
        var result = jQuery.parseJSON(xhr.responseText);
        console.log(result);
        if (result.python_error) {
          alert(result.python_error);
        } else {
          process_result(result);
        }
      });
  
      file.event('error', function (e, xhr) {
        alert('Error uploading ' + this.name + ': ' +
              xhr.status + ', ' + xhr.statusText);
      });

      // this ensures that the CSRF middleware in Django doesn't reject our
      // HTTP request
      file.event('xhrSetup', function (xhr) {
         xhr.setRequestHeader("X-CSRFToken", csrftoken);
      });
  
      file.sendTo(url);
    });
  });
};

function startWaitBadge (selector) {
  $(selector).css("class", "waitbadge wait");
};

function stopWaitBadge (element_id) {
  $(selector).css("class", "waitbadge");
};

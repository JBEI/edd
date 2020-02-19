// This file just imports all the stylesheets used anywhere,
// so the styles can be extracted in a consistent order.
// Should *only* import styles from node_modules here.

// import separately from everything else so jquery-ui takes priority
import "jquery-ui/themes/base/all.css";

import "dropzone/dist/dropzone.css";
import "handsontable.css";
import "tinymce/skins/ui/oxide/content.css";
import "tinymce/skins/ui/oxide/skin.css";

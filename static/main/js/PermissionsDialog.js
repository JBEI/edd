/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="lib/jqueryui.d.ts" />
var Permissions;
(function (Permissions) {
    var PermissionsDialog = (function () {
        // verifyPermissionsFunc is called before the dialog is removed. 
        // It should call onCompleted with null if the new permissions were accepted,
        // and call it with an error string if they weren't.
        function PermissionsDialog(readonly, attachTo, initialPermissions, verifyPermissionsFunc) {
            this._isReadOnly = true;
            // See _onModified() for info on how+why we hook the overlay.
            this._hasHookedOverlay = false;
            // This represents the current permissions list.
            this._permissions = [];
            // Used to prevent handling incoming server data if the user cancelled the dialog before it came in.
            this._wasCancelled = false;
            // Track whether we're even visible anymore so we can avoid responding to any
            // handlers that we might still be attached to.
            this._hasThisDialogBeenRemoved = false;
            this._permissions = initialPermissions;
            this._isReadOnly = readonly;
            this._verifyPermissionsFunc = verifyPermissionsFunc;
            var initialHeight = 270;
            var qtipZIndex = 15e3; // This is hardcoded in the qtip code. We can't pull it from the 
            // qtip element as soon as we need it, so we hard-code it here.
            // Create a dummy object to attach the qtip to, otherwise it'll 
            // sometimes not create a qtip right after destroying a previous one.
            var qtipEl = Utl.JS.createElementFromString('<div"></div>');
            this._qtipAttachmentElement = qtipEl;
            attachTo.appendChild(qtipEl);
            this._qtip = $(qtipEl).qtip({
                content: {
                    title: "Edit Permissions",
                    text: this._generatePermissionsPopup.bind(this, initialHeight)
                },
                position: {
                    my: 'bottom right',
                    at: 'top left',
                    target: $(qtipEl),
                    viewport: $(window) // This makes it position itself to fit inside the browser window.
                },
                style: {
                    classes: 'qtip-blue qtip-shadow qtip-rounded'
                },
                show: {
                    ready: true,
                    modal: {
                        on: true
                    }
                },
                hide: false
            });
            // Create our entry permission popup. We won't use it until we need to..
            this._entryPermissionPopup = new EntryPermissionPopup(this);
        }
        // Remove the specified permissions entry and redraw..
        PermissionsDialog.prototype.deletePermissionEntry = function (p) {
            var i = this._permissions.indexOf(p);
            if (i != -1) {
                this._permissions.splice(i, 1);
                this.onModifiedPermissions();
            }
        };
        // Called if any of the permissions are modified. This rebuilds the whole list.
        PermissionsDialog.prototype.onModifiedPermissions = function () {
            this._populatePermissionsList(false);
            this._onModified();
        };
        // Get the HTML element for the qtip. Usually we use this to unset max-width.
        PermissionsDialog.prototype._getQTipElement = function () {
            return document.getElementById(this._qtip.attr('aria-describedby'));
        };
        // This is called to generate the HTML for the permissions window.
        PermissionsDialog.prototype._generatePermissionsPopup = function (initialHeight) {
            var _this = this;
            // It's incredibly stupid that we have to do this to work around qtip2's 280px max-width default.
            // We have to do it here rather than immediately after calling qtip() because qtip waits to create
            // the actual element.
            var q = this._getQTipElement();
            $(q).css('max-width', 'none');
            $(q).css('width', 'auto');
            // Create the label.
            var topDiv = Utl.JS.createElementFromString('<div style="min-width:300px; padding:6px;"></div>');
            // Setup the 'loading...' div, which we'll use initially.
            this._loadingDiv = Utl.JS.createElementFromString('<div id="permissionsLoadingDiv">\
		    	<table width="100%" height="' + initialHeight.toString() + '"> \
		    		<tr><td align="center"> \
		    			<div id="permissionsLoadingContent">Loading... \
		    				<br><br> \
		    				<img src="images/loading_spinner.gif"></img> \
		    			</div> \
		    		</td></tr> \
		    	</table>\
		    	</div>');
            topDiv.appendChild(this._loadingDiv);
            // Create the main div that shows up when we've successfully gotten the LDAP data in.
            this._mainDiv = Utl.JS.createElementFromString('<div id="permissionsMainDiv" style="display: none"></div>');
            topDiv.appendChild(this._mainDiv);
            var add = function (txt, to) {
                if (to === void 0) { to = null; }
                var element = Utl.JS.createElementFromString(txt);
                (to ? to : _this._mainDiv).appendChild(element);
                return element;
            };
            if (!this._isReadOnly) {
                add('<center>' + '<span style="font-size:14px">Add a New Permission</div>' + '<br />' + '<input class="' + PermissionsDialog.InputFieldName + '" style="margin: 6px;"></input>' + '</center>');
                add('<br />');
                add('<br />');
            }
            add('<span style="font-size:14px">Current Permissions</span>');
            add('<br />');
            // Create the list. We won't populate it until we've received the LDAP data
            // so we can convert IDs into names.
            var listElement = add('<ul class="permissionsList list"></ul>');
            this._permissionsListElement = listElement;
            if (!this._isReadOnly) {
                var sortable = $(listElement).sortable({
                    update: function (event, ui) {
                        // Parse out the element IDs into numbers.
                        var strOrder = $(listElement).sortable("toArray");
                        var order = [];
                        for (var i = 0; i < strOrder.length; i++) {
                            var index = parseFloat(strOrder[i].slice(_this._listElementPrefix.length));
                            order.push(index);
                        }
                        // Call our function to handle the new order.
                        _this._onUpdateSortOrder(order);
                    }
                });
            }
            this._populatePermissionsList();
            // need to put all of this in a timeout/callback because animations delay elements from being created
            window.setTimeout(function () {
                // Show the main div now.
                $(_this._loadingDiv).fadeOut('fast', function () {
                    $(_this._mainDiv).fadeIn('fast');
                });
                // If we're not in read-only mode, make an autocomplete field for adding permissions
                if (!_this._isReadOnly) {
                    var q = _this._getQTipElement();
                    // Make a list of all names and groups combined. We need to track for each one which
                    // Grab the input field
                    var inputField = $('.' + PermissionsDialog.InputFieldName, q);
                    if (inputField.length === 0) {
                        console.log("Cannot find field " + PermissionsDialog.InputFieldName);
                        return;
                    }
                    // Turn the contents of the handle into an autocomplete widget (or widgets)
                    var autoc = inputField.autocomplete({
                        'source': _this._handleAutoCompleteRequest,
                        'select': _this._handleAutoCompleteSelect
                    }).data('dialog', _this);
                    // Override the internal _renderItem function so we can set the z index
                    var handle = autoc.data("ui-autocomplete");
                    handle._renderItem = function (ul, item) {
                        ul.css('z-index', '20001');
                        return $("<li>").append("<a>" + item.label + "</a>").appendTo(ul);
                    };
                }
            }, 0);
            return topDiv;
        };
        // Fully populate the permissions list.
        PermissionsDialog.prototype._populatePermissionsList = function (fadeIn) {
            if (fadeIn === void 0) { fadeIn = true; }
            // Get rid of any child elements in the list already.
            Utl.JS.removeAllChildren(this._permissionsListElement);
            for (var i = 0; i < this._permissions.length; i++) {
                var permission = this._permissions[i];
                var el = this._createListElementForPermission(permission, fadeIn);
                this._permissionsListElement.appendChild(el);
            }
            // Assign IDs.
            this._assignIDsToListElements();
        };
        // Returns a friendly string for an EDD ACL access like 'r' or 'w'.
        PermissionsDialog.prototype._getFriendlyStringForPermission = function (p) {
            if (p.isPermissionReadOnly())
                return 'read only';
            else if (p.isPermissionReadWrite())
                return 'read + write';
            else if (p.isPermissionNoAccess())
                return 'no access';
            else
                return 'unknown!';
        };
        // Create the <li> element for a given permission.
        PermissionsDialog.prototype._createListElementForPermission = function (p, fadeIn) {
            var _this = this;
            if (fadeIn === void 0) { fadeIn = true; }
            // If they want to fade it in, start it out invisible.
            var style = '';
            if (fadeIn) {
                style = 'display:none;';
            }
            p.visualElement = Utl.JS.createElementFromString('<li style="' + style + '">' + p.label + '</li>');
            // Add an element to add/edit the permission this user/group has.
            var permissionElement = Utl.JS.createElementFromString('<div style="width: 70px; text-align: center;" class="permissionsEditButton">' + this._getFriendlyStringForPermission(p) + '</div>');
            p.visualElement.appendChild(permissionElement);
            $(permissionElement).click(function () {
                if (!_this._isReadOnly)
                    _this._entryPermissionPopup.createPopup(p, permissionElement);
            });
            // Fade it in.
            if (fadeIn) {
                $(p.visualElement).fadeIn('fast');
            }
            return p.visualElement;
        };
        // Called when the user drags/drops something to reorder the list.
        PermissionsDialog.prototype._onUpdateSortOrder = function (order) {
            Utl.JS.assert(order.length == this._permissions.length, "permissions list size mismatch");
            var newList = [];
            for (var i = 0; i < this._permissions.length; i++)
                newList.push(null);
            for (var i = 0; i < this._permissions.length; i++)
                newList[i] = this._permissions[order[i]];
            this._permissions = newList;
            // Assign new IDs so the list elements match the order of our permissions again.
            this._assignIDsToListElements();
            this._onModified();
        };
        // Called by the jqueryui autocomplete control. Should add new entry to permission list
        PermissionsDialog.prototype._handleAutoCompleteSelect = function (event, ui) {
            // create permission object
            var permission = Permission.create(ui.item.value.isGroup, ui.item.value.id, Permission_Read());
            var self = $(event.target).data('dialog');
            permission.label = ui.item.label;
            self._permissions.unshift(permission);
            // add an <li> to the list
            var el = self._createListElementForPermission(permission);
            $(self._permissionsListElement).prepend(el);
            // TODO: see if these can be removed; old code regenerated element IDs
            self._assignIDsToListElements();
            self._onModified();
            // clear the input element text
            $(event.target).val('');
            return false; // returning false prevents default handler from attempting to set text
        };
        // Called by the jqueryui autocomplete control. Should return a list of anything that matches.
        PermissionsDialog.prototype._handleAutoCompleteRequest = function (request, response) {
            // Data returned is wrapped in the same object format used by other ajax requests
            // need to make sure the returned data is labeled as "Success", then merge the arrays
            $.ajax({
                'type': 'POST',
                'dataType': 'json',
                'url': 'FormAjaxResp.cgi',
                'data': { 'action': 'searchAccountsUsersAndGroups', 'query': request.term },
                'success': function (data) {
                    data && data.type === "Success" ? response($.merge(data.data.users, data.data.groups)) : response([]);
                },
                'error': function () {
                    response([]);
                }
            });
        };
        // Assign an ID to each list element so its ID gives the index into _permissions.
        PermissionsDialog.prototype._assignIDsToListElements = function () {
            // Setup a unique list element prefix.
            this._listElementPrefix = "PermissionsListElement" + PermissionsDialog.curUniqueDialogIdentifier + "-";
            PermissionsDialog.curUniqueDialogIdentifier++;
            for (var i = 0; i < this._permissions.length; i++) {
                var permission = this._permissions[i];
                $(permission.visualElement).attr('id', this._listElementPrefix + i);
            }
            //this._debugPrint();
        };
        // Call this anytime the permissions list is modified. 
        PermissionsDialog.prototype._onModified = function () {
            if (!this._hasHookedOverlay) {
                // Hook the background overlay so we can verify the permissions changes
                // with the server before removing the permissions popup.
                $('#qtip-overlay').bindFirst('click', this._onClickedOverlayBackground.bind(this));
            }
        };
        // See _onModified()
        PermissionsDialog.prototype._onClickedOverlayBackground = function (event) {
            var _this = this;
            // If this dialog is supposed to be gone, don't handle anything in the overlay.
            // Ideally, we could unbind our click handler from the overlay when we go away,
            // but that's not working..
            if (this._hasThisDialogBeenRemoved)
                return;
            // Don't let it automatically disappear. We're gonna need to contact the server 
            // and make sure it likes the permissions they've set.
            event.stopImmediatePropagation();
            var encodedPermissions = this._encodePermissionsString();
            this._verifyPermissionsFunc(encodedPermissions, function (result) {
                if (result == null) {
                    _this._removePopup();
                }
                else {
                    // TODO: Show a messagebox popup here and allow them to cancel editing.
                    console.log('result = ' + result);
                    _this._removePopup();
                }
            });
        };
        // Remove ourselves..
        PermissionsDialog.prototype._removePopup = function () {
            var q = this._getQTipElement();
            var inputField = $('.' + PermissionsDialog.InputFieldName, q);
            this._hasThisDialogBeenRemoved = true;
            // Get rid of autocomplete
            inputField.autocomplete('destroy');
            // Get rid of our qtip.
            $(this._qtipAttachmentElement).qtip('hide');
            Utl.JS.removeFromParent(this._qtipAttachmentElement);
            this._qtipAttachmentElement = null;
        };
        // Take all the permissions and build the encoded string for them.
        PermissionsDialog.prototype._encodePermissionsString = function () {
            var cur = '';
            for (var i = 0; i < this._permissions.length; i++) {
                if (i > 0)
                    cur += ',';
                cur += this._permissions[i].encode();
            }
            return cur;
        };
        // Spew the list of permissions to the debug console.
        PermissionsDialog.prototype._debugPrint = function () {
            for (var i = 0; i < this._permissions.length; i++) {
                console.log(this._permissions[i].id);
            }
            console.log("");
        };
        PermissionsDialog.InputFieldName = 'permissionsTags';
        PermissionsDialog.curUniqueDialogIdentifier = 0; // Used to assign unique IDs to elements.
        return PermissionsDialog;
    })();
    Permissions.PermissionsDialog = PermissionsDialog;
    // This holds the code to manage the popup that lets them select a specific permission (read, read+write, etc)
    // for an entry in the permissions list.
    var EntryPermissionPopup = (function () {
        function EntryPermissionPopup(dlg) {
            this._permissionsDialog = dlg;
        }
        // They clicked on a button to edit a specific entry's permissions.
        // Show a list of options.
        EntryPermissionPopup.prototype.createPopup = function (p, permissionElement) {
            this._removePermissionEditPopup(p);
            // Create a dummy element to attach the qtip to.
            p.qtipDummyElement = Utl.JS.createElementFromString('<div"></div>');
            permissionElement.appendChild(p.qtipDummyElement);
            $(p.qtipDummyElement).qtip({
                content: {
                    title: "Edit",
                    text: this._generateEntryPermissionEditPopup.bind(this, p)
                },
                position: {
                    my: 'bottom right',
                    at: 'top left',
                    target: $(p.qtipDummyElement),
                    viewport: $(window) // This makes it position itself to fit inside the browser window.
                },
                style: {
                    classes: 'qtip-blue qtip-shadow qtip-rounded'
                },
                show: {
                    ready: true,
                    event: '',
                    // to show up when we manually tell it to.
                    modal: {
                        on: true
                    }
                },
                hide: false
            });
        };
        // Get rid of any previous qtip attached here. If we don't do this, the dimmed background
        // for the modal qtip won't work properly the second time around.
        EntryPermissionPopup.prototype._removePermissionEditPopup = function (p) {
            if (p.qtipDummyElement) {
                $(p.qtipDummyElement).qtip('hide');
                Utl.JS.removeFromParent(p.qtipDummyElement);
                p.qtipDummyElement = null;
            }
        };
        EntryPermissionPopup.prototype._generateEntryPermissionEditPopup = function (p) {
            var _this = this;
            var mainTable = document.createElement('table');
            var readOnlyButton = Utl.JS.createElementFromString('<div class="entryPermissionPopupButton entryPermissionPopupAccessButton">Read-only</div>');
            var readWriteButton = Utl.JS.createElementFromString('<div class="entryPermissionPopupButton entryPermissionPopupAccessButton">Read + Write</div>');
            var noAccessButton = Utl.JS.createElementFromString('<div class="entryPermissionPopupButton entryPermissionPopupAccessButton">No Access</div>');
            var deleteButton = Utl.JS.createElementFromString('<div class="entryPermissionPopupButton entryPermissionChooserDeleteButtonStyle">(Delete this Entry)</div>');
            if (p.isPermissionReadOnly())
                $(readOnlyButton).addClass('entryPermissionPopupAccessButtonHighlighted');
            else if (p.isPermissionReadWrite())
                $(readWriteButton).addClass('entryPermissionPopupAccessButtonHighlighted');
            else if (p.isPermissionNoAccess())
                $(noAccessButton).addClass('entryPermissionPopupAccessButtonHighlighted');
            mainTable.insertRow(0).insertCell(0).appendChild(readOnlyButton);
            mainTable.insertRow(1).insertCell(0).appendChild(readWriteButton);
            mainTable.insertRow(2).insertCell(0).appendChild(noAccessButton);
            mainTable.insertRow(3).insertCell(0).appendChild(deleteButton);
            $(readOnlyButton).click(function () { return _this._onSelectedEntryPermission(p, Permission_Read()); });
            $(readWriteButton).click(function () { return _this._onSelectedEntryPermission(p, Permission_ReadWrite()); });
            $(noAccessButton).click(function () { return _this._onSelectedEntryPermission(p, Permission_None()); });
            $(deleteButton).click(function () { return _this._onSelectedDeleteEntry(p); });
            return mainTable;
        };
        // Called when they click a specific permission (read, read/write, etc) on the entry permission popup.
        EntryPermissionPopup.prototype._onSelectedEntryPermission = function (p, val) {
            p.permission = val;
            this._permissionsDialog.onModifiedPermissions();
            this._removePermissionEditPopup(p);
        };
        EntryPermissionPopup.prototype._onSelectedDeleteEntry = function (p) {
            this._permissionsDialog.deletePermissionEntry(p);
            this._removePermissionEditPopup(p);
        };
        return EntryPermissionPopup;
    })();
    // This should stay in sync with the same-named structure in AccountsDirectory.pm.
    var AccountsUser = (function () {
        function AccountsUser() {
        }
        return AccountsUser;
    })();
    // This should stay in sync with the same-named structure in AccountsDirectory.pm.
    var AccountsGroup = (function () {
        function AccountsGroup() {
        }
        return AccountsGroup;
    })();
    // Constants for access permissions.
    function Permission_Read() {
        return 'r';
    }
    Permissions.Permission_Read = Permission_Read;
    function Permission_ReadWrite() {
        return 'w';
    }
    Permissions.Permission_ReadWrite = Permission_ReadWrite;
    function Permission_None() {
        return 'n';
    }
    Permissions.Permission_None = Permission_None;
    // This represents a permission for a group or a user on the client.
    // It can import and export the database's format for permissions.
    var Permission = (function () {
        function Permission() {
            this.isGroup = false;
        }
        Permission.create = function (isGroup, id, permission) {
            var p = new Permission();
            p.isGroup = isGroup;
            p.id = id;
            p.permission = permission;
            return p;
        };
        // The string should be like "[g or u]:ID:permission"
        Permission.createFromString = function (str) {
            var parts = str.split(':');
            var p = new Permission();
            p.isGroup = (parts[0] == 'g');
            p.id = parts[1];
            p.permission = parts[2];
            return p;
        };
        // Return a string encoded for the database.
        Permission.prototype.encode = function () {
            var groupOrUser = (this.isGroup ? 'g' : 'u');
            return groupOrUser + ":" + this.id + ":" + this.permission;
        };
        // Test for permission type.
        Permission.prototype.isPermissionReadOnly = function () {
            return this.permission == Permission_Read();
        };
        Permission.prototype.isPermissionReadWrite = function () {
            return this.permission == Permission_ReadWrite();
        };
        Permission.prototype.isPermissionNoAccess = function () {
            return this.permission == Permission_None();
        };
        return Permission;
    })();
    Permissions.Permission = Permission;
})(Permissions || (Permissions = {}));

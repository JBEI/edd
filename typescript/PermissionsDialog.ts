/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="lib/jqueryui.d.ts" />

module Permissions {
	export class PermissionsDialog {

		// verifyPermissionsFunc is called before the dialog is removed. 
		// It should call onCompleted with null if the new permissions were accepted,
		// and call it with an error string if they weren't.
		constructor(readonly:boolean, attachTo:HTMLElement, initialPermissions:Permission[], verifyPermissionsFunc:VerifyPermissionsFunc ) {

            this._permissions = initialPermissions;
		    this._isReadOnly = readonly;
		    this._verifyPermissionsFunc = verifyPermissionsFunc;

		    var initialHeight:number = 270;
		    var qtipZIndex:number = 15e3;	// This is hardcoded in the qtip code. We can't pull it from the 
		    						// qtip element as soon as we need it, so we hard-code it here.

	    	// Create a dummy object to attach the qtip to, otherwise it'll 
	    	// sometimes not create a qtip right after destroying a previous one.
	    	var qtipEl:HTMLElement = Utl.JS.createElementFromString('<div"></div>');
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
		            viewport: $(window)	// This makes it position itself to fit inside the browser window.
		        },
		        style: {
		            classes: 'qtip-blue qtip-shadow qtip-rounded'	
		        },
		        show: {
		        	ready: true,
		        	modal: {
		        		on: true
		        	}
		        },	// 'ready' means to show it immediately.
		        hide: false

		    });

		    // Create our entry permission popup. We won't use it until we need to..
		    this._entryPermissionPopup = new EntryPermissionPopup(this);
		}


		// Remove the specified permissions entry and redraw..
		public deletePermissionEntry(p:Permission):void {
			var i:number = this._permissions.indexOf(p);
			if (i != -1) {
				this._permissions.splice(i, 1);
				this.onModifiedPermissions();
			}
		}


		// Called if any of the permissions are modified. This rebuilds the whole list.
		public onModifiedPermissions():void {
			this._populatePermissionsList(false);
			this._onModified();
		}


		// Get the HTML element for the qtip. Usually we use this to unset max-width.
		private _getQTipElement():HTMLElement {
			return document.getElementById(this._qtip.attr('aria-describedby'));
		}


		// This is called to generate the HTML for the permissions window.
		private _generatePermissionsPopup(initialHeight) {

			// It's incredibly stupid that we have to do this to work around qtip2's 280px max-width default.
			// We have to do it here rather than immediately after calling qtip() because qtip waits to create
			// the actual element.
			var q = this._getQTipElement();
			$(q).css('max-width', 'none');
			$(q).css('width', 'auto');

		    // Create the label.
		    var topDiv:HTMLElement = Utl.JS.createElementFromString('<div style="min-width:300px; padding:6px;"></div>');

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

		    var add = (txt, to=null) => {
                var element = Utl.JS.createElementFromString(txt);
                (to ? to : this._mainDiv).appendChild(element);
                return element;
            };

		    if (!this._isReadOnly) {
			    add('<center>' +
			        '<span style="font-size:14px">Add a New Permission</div>' +
			    	'<br />' +
			    	'<input class="' + PermissionsDialog.InputFieldName + '" style="margin: 6px;"></input>' +
			    	'</center>');
			    add('<br />');
			    add('<br />');
			}

		    add('<span style="font-size:14px">Current Permissions</span>');
		    add('<br />');

		    // Create the list. We won't populate it until we've received the LDAP data
		    // so we can convert IDs into names.
		    var listElement:HTMLElement = add('<ul class="permissionsList list"></ul>');
		    this._permissionsListElement = listElement;


		    if (!this._isReadOnly) {
			    var sortable = $(listElement).sortable({
			    	update: (event, ui) => {
			    		// Parse out the element IDs into numbers.
			    		var strOrder:string[] = $(listElement).sortable("toArray");
			    		var order:number[] = [];
			    		for (var i=0; i < strOrder.length; i++) {
			    			var index:number = parseFloat(strOrder[i].slice(this._listElementPrefix.length));
			    			order.push(index);
			    		}
			    		// Call our function to handle the new order.
			    		this._onUpdateSortOrder(order);
			    	}
			    });
			}
            
            this._populatePermissionsList();
            
            // need to put all of this in a timeout/callback because animations delay elements from being created
            window.setTimeout(() => {
                // Show the main div now.
                $(this._loadingDiv).fadeOut('fast', () => {
                    $(this._mainDiv).fadeIn('fast');
                });
                // If we're not in read-only mode, make an autocomplete field for adding permissions
                if (!this._isReadOnly) {
                    var q = this._getQTipElement();
                    // Make a list of all names and groups combined. We need to track for each one which
                    // Grab the input field
                    var inputField = $('.' + PermissionsDialog.InputFieldName, q);
                    if (inputField.length === 0) {
                        console.log("Cannot find field " + PermissionsDialog.InputFieldName);
                        return;
                    }
                    // Turn the contents of the handle into an autocomplete widget (or widgets)
                    var autoc = inputField.autocomplete({
                        'source': this._handleAutoCompleteRequest,
                        'select': this._handleAutoCompleteSelect
                    }).data('dialog', this);
                    // Override the internal _renderItem function so we can set the z index
                    var handle = autoc.data( "ui-autocomplete" );
                    handle._renderItem = function( ul, item ) {
                        ul.css('z-index', '20001');
                        return $( "<li>" ).append( "<a>" + item.label + "</a>" ).appendTo( ul );
                    };
                }
            }, 0);

		    return topDiv;
		}


		// Fully populate the permissions list.
		private _populatePermissionsList(fadeIn:boolean = true) {
			// Get rid of any child elements in the list already.
			Utl.JS.removeAllChildren(this._permissionsListElement);

		    // This is the string that'll get stored in the database with a list of 
		    // users or groups + permissions. The creator of this study is always assumed to have 
		    // full access.
		    for (var i=0; i < this._permissions.length; i++) {
		        var permission:Permission = this._permissions[i];
		    	var el:HTMLElement = this._createListElementForPermission(permission, fadeIn);
		    	this._permissionsListElement.appendChild(el);
		    }

		    // Assign IDs.
		    this._assignIDsToListElements();
		}


		// Returns a friendly string for an EDD ACL access like 'r' or 'w'.
		private _getFriendlyStringForPermission(p:Permission):string {
			if (p.isPermissionReadOnly())
				return 'read only';
			else if (p.isPermissionReadWrite())
				return 'read + write';
			else if (p.isPermissionNoAccess())
				return 'no access';
			else
				return 'unknown!';
		}


		// Create the <li> element for a given permission.
		private _createListElementForPermission(p:Permission, fadeIn:boolean = true):HTMLElement {
		
			// If they want to fade it in, start it out invisible.
			var style:string = '';
			if (fadeIn) {
				style = 'display:none;';
			}

	        p.visualElement = Utl.JS.createElementFromString('<li style="' + style + '">' + 
	        	p.label + '</li>');

	        // Add an element to add/edit the permission this user/group has.
	        var permissionElement:HTMLElement = Utl.JS.createElementFromString('<div style="width: 70px; text-align: center;" class="permissionsEditButton">' +
	        	this._getFriendlyStringForPermission(p) + '</div>');
	        p.visualElement.appendChild(permissionElement);
	        $(permissionElement).click( () => {
	        	if (!this._isReadOnly)
	        		this._entryPermissionPopup.createPopup(p, permissionElement)
	        });

	        // Fade it in.
	        if (fadeIn) {
	        	$(p.visualElement).fadeIn('fast');
	        }

	        return p.visualElement;
		}


		// Called when the user drags/drops something to reorder the list.
		private _onUpdateSortOrder(order:number[]) {
			Utl.JS.assert(order.length == this._permissions.length, "permissions list size mismatch");

			var newList:Permission[] = [];
			for (var i:number=0; i < this._permissions.length; i++)
				newList.push(null);

			for (var i:number=0; i < this._permissions.length; i++)
				newList[i] = this._permissions[order[i]];

			this._permissions = newList;

			// Assign new IDs so the list elements match the order of our permissions again.
			this._assignIDsToListElements();

			this._onModified();
		}
        
        
        // Called by the jqueryui autocomplete control. Should add new entry to permission list
        private _handleAutoCompleteSelect(event, ui) {
            // create permission object
            var permission:Permission = Permission.create(ui.item.value.isGroup, ui.item.value.id, Permission_Read());
            var self:PermissionsDialog = $(event.target).data('dialog');
            permission.label = ui.item.label;
            self._permissions.unshift(permission);
            // add an <li> to the list
            var el:HTMLElement = self._createListElementForPermission(permission);
            $(self._permissionsListElement).prepend(el);
            // TODO: see if these can be removed; old code regenerated element IDs
            self._assignIDsToListElements();
            self._onModified();
            // clear the input element text
            $(event.target).val('');
            return false;  // returning false prevents default handler from attempting to set text
        }


		// Called by the jqueryui autocomplete control. Should return a list of anything that matches.
		private _handleAutoCompleteRequest(request, response) {
            // Data returned is wrapped in the same object format used by other ajax requests
            // need to make sure the returned data is labeled as "Success", then merge the arrays
            $.ajax({
                'type': 'POST',
                'dataType': 'json',
                'url': 'FormAjaxResp.cgi',
                'data': { 'action': 'searchAccountsUsersAndGroups', 'query': request.term },
                'success': (data) => { data && data.type === "Success" ?
                    response($.merge(data.data.users, data.data.groups)) :
                    response([]); },
                'error': () => { response([]); }
            });
		}


		// Assign an ID to each list element so its ID gives the index into _permissions.
		private _assignIDsToListElements():void {
			// Setup a unique list element prefix.
		    this._listElementPrefix = "PermissionsListElement" + PermissionsDialog.curUniqueDialogIdentifier + "-";
		    PermissionsDialog.curUniqueDialogIdentifier++;

			for (var i:number=0; i < this._permissions.length; i++) {
				var permission:Permission = this._permissions[i];
				$(permission.visualElement).attr('id', this._listElementPrefix + i);
			}

			//this._debugPrint();
		}


		// Call this anytime the permissions list is modified. 
		private _onModified() {
			if (!this._hasHookedOverlay) {
				// Hook the background overlay so we can verify the permissions changes
				// with the server before removing the permissions popup.
				$('#qtip-overlay').bindFirst('click', this._onClickedOverlayBackground.bind(this));
			}
		}


		// See _onModified()
		private _onClickedOverlayBackground(event:any) {
			// If this dialog is supposed to be gone, don't handle anything in the overlay.
			// Ideally, we could unbind our click handler from the overlay when we go away,
			// but that's not working..
			if (this._hasThisDialogBeenRemoved)
				return;

			// Don't let it automatically disappear. We're gonna need to contact the server 
			// and make sure it likes the permissions they've set.
			event.stopImmediatePropagation();

			var encodedPermissions:string = this._encodePermissionsString();

			this._verifyPermissionsFunc(encodedPermissions, (result:string) => {

				if (result == null) {

					this._removePopup();

				} else {
					// TODO: Show a messagebox popup here and allow them to cancel editing.
					console.log('result = ' + result);
                    this._removePopup();
				}

			});

		}

		// Remove ourselves..
		private _removePopup():void {
            var q = this._getQTipElement();
            var inputField = $('.' + PermissionsDialog.InputFieldName, q);
			this._hasThisDialogBeenRemoved = true;
            // Get rid of autocomplete
            inputField.autocomplete('destroy');
			// Get rid of our qtip.
    		$(this._qtipAttachmentElement).qtip('hide');
    		Utl.JS.removeFromParent(this._qtipAttachmentElement);
    		this._qtipAttachmentElement = null;
		}

		// Take all the permissions and build the encoded string for them.
		private _encodePermissionsString():string {
			var cur:string = '';

			for (var i=0; i < this._permissions.length; i++) {
				if (i > 0)
					cur += ',';

				cur += this._permissions[i].encode();
			}

			return cur;
		}


		// Spew the list of permissions to the debug console.
		private _debugPrint():void {
			for (var i=0; i < this._permissions.length; i++) {
				console.log(this._permissions[i].id);
			}
			console.log("");
		}

		private static InputFieldName:string = 'permissionsTags';
		private static curUniqueDialogIdentifier:number = 0;	// Used to assign unique IDs to elements.

		private _entryPermissionPopup:EntryPermissionPopup;

		private _isReadOnly:boolean = true;

		// See _onModified() for info on how+why we hook the overlay.
		private _hasHookedOverlay:boolean = false;

		// The id of each <li> element in our list is prefixed by this. 
		private _listElementPrefix:string;

		// qtip()
		private _qtip:any;

		// The <ul> element that holds the list of permissions.
		private _permissionsListElement:HTMLElement;

		// This represents the current permissions list.
		private _permissions:Permission[] = [];

		// If undefined, then it hasn't been reordered.
		private _newOrder:number[];

		// The two divs that show each primary state.
		private _mainDiv:HTMLElement;
		private _loadingDiv:HTMLElement;

		// Used to prevent handling incoming server data if the user cancelled the dialog before it came in.
		private _wasCancelled:boolean = false;

		// We call this to verify changes with the server.
		private _verifyPermissionsFunc:VerifyPermissionsFunc;

		// We attach the qtip to this invisible element rather than to the one they pass in
		// because qtip sometimes doesn't work the second time around on the same element.
		private _qtipAttachmentElement:HTMLElement;

		// Track whether we're even visible anymore so we can avoid responding to any
		// handlers that we might still be attached to.
		private _hasThisDialogBeenRemoved:boolean = false;
	}


	// See PermissionsDialog.constructor
	export interface VerifyPermissionsFunc { 
		(newPermissions:string, onCompleted: (result:string)=>void) : void; 
	}


	// This holds the code to manage the popup that lets them select a specific permission (read, read+write, etc)
	// for an entry in the permissions list.
	class EntryPermissionPopup {

		public constructor(dlg:PermissionsDialog) {
			this._permissionsDialog = dlg;
		}

		// They clicked on a button to edit a specific entry's permissions.
		// Show a list of options.
		public createPopup(p:Permission, permissionElement:HTMLElement):void {
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
		            viewport: $(window)	// This makes it position itself to fit inside the browser window.
		        },
		        style: {
		            classes: 'qtip-blue qtip-shadow qtip-rounded'
		        },
		        show: {
		        	ready: true,
		        	event: '',	// Normally, it'll show the qtip again for onmouseenter, but we only want this thing
		        				// to show up when we manually tell it to.
		        	modal: {
		        		on: true
		        	}
		        },	// 'ready' means to show it immediately.
		        hide: false

		    });
		}

		// Get rid of any previous qtip attached here. If we don't do this, the dimmed background
		// for the modal qtip won't work properly the second time around.
		private _removePermissionEditPopup(p:Permission) {
	    	if (p.qtipDummyElement) {
	    		$(p.qtipDummyElement).qtip('hide');
	    		Utl.JS.removeFromParent(p.qtipDummyElement);
	    		p.qtipDummyElement = null;
	    	}
		}

		private _generateEntryPermissionEditPopup(p:Permission) {
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

			(<any>mainTable.insertRow(0)).insertCell(0).appendChild(readOnlyButton);
			(<any>mainTable.insertRow(1)).insertCell(0).appendChild(readWriteButton);
			(<any>mainTable.insertRow(2)).insertCell(0).appendChild(noAccessButton);
			(<any>mainTable.insertRow(3)).insertCell(0).appendChild(deleteButton);

			$(readOnlyButton) .click( () => this._onSelectedEntryPermission(p, Permission_Read()) );
			$(readWriteButton).click( () => this._onSelectedEntryPermission(p, Permission_ReadWrite()) );
			$(noAccessButton) .click( () => this._onSelectedEntryPermission(p, Permission_None()) );
			$(deleteButton)   .click( () => this._onSelectedDeleteEntry(p) );

			return mainTable;
		}

		// Called when they click a specific permission (read, read/write, etc) on the entry permission popup.
		private _onSelectedEntryPermission(p:Permission, val:string) {
			p.permission = val;
			this._permissionsDialog.onModifiedPermissions();
			this._removePermissionEditPopup(p);
		}

		private _onSelectedDeleteEntry(p:Permission) {
			this._permissionsDialog.deletePermissionEntry(p);
			this._removePermissionEditPopup(p);
		}

		_permissionsDialog:PermissionsDialog;
	}



	// This should stay in sync with the same-named structure in AccountsDirectory.pm.
	class AccountsUser {
		userID:string;
		fullName:string;
		groups:{[groupID:string]:number};	// The keys are group IDs, values are all 1.
	}

	// This should stay in sync with the same-named structure in AccountsDirectory.pm.
	class AccountsGroup {
		groupID:string;
		groupName:string;
		users:{[userID:string]:number};		// The keys are user IDs, values are all 1.
	}


	// Constants for access permissions.
	export function Permission_Read():string 		{ return 'r'; }
	export function Permission_ReadWrite():string 	{ return 'w'; }
	export function Permission_None():string 		{ return 'n'; }


	// This represents a permission for a group or a user on the client.
	// It can import and export the database's format for permissions.
	export class Permission {

		static create(isGroup:boolean, id:string, permission:string):Permission {
			var p:Permission = new Permission();
			p.isGroup = isGroup;
			p.id = id;
			p.permission = permission;
			return p;
		}

		// The string should be like "[g or u]:ID:permission"
		static createFromString(str:string):Permission {
	        var parts = str.split(':');

			var p:Permission = new Permission();
	        p.isGroup = (parts[0] == 'g');
	        p.id = parts[1];
	        p.permission = parts[2];
	        return p;
		}

		// Return a string encoded for the database.
		encode():string {
			var groupOrUser = (this.isGroup ? 'g' : 'u');
			return groupOrUser + ":" + this.id + ":" + this.permission;
		}

		// Test for permission type.
		isPermissionReadOnly():boolean  { return this.permission == Permission_Read(); }
		isPermissionReadWrite():boolean { return this.permission == Permission_ReadWrite(); }
		isPermissionNoAccess():boolean  { return this.permission == Permission_None(); }


		isGroup:boolean = false;
		id:string;					// user or group id
		permission:string;			// read, readwrite, none
        label:string;               // user-friendly display text

		// This is only used by the permissions dialog to track the <li> attached to this permission.
		visualElement:HTMLElement;

		// Used to track the qtip attached to this permission. (This actually refers to a dummy
		// element that we attach to the (read/write) permissions button for this entry).
		qtipDummyElement:HTMLElement;
	}
}

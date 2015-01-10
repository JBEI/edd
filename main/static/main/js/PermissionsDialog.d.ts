/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.d.ts" />
/// <reference path="lib/jqueryui.d.ts" />
declare module Permissions {
    class PermissionsDialog {
        constructor(readonly: boolean, attachTo: HTMLElement, initialPermissions: Permission[], verifyPermissionsFunc: VerifyPermissionsFunc);
        deletePermissionEntry(p: Permission): void;
        onModifiedPermissions(): void;
        private _getQTipElement();
        private _generatePermissionsPopup(initialHeight);
        private _populatePermissionsList(fadeIn?);
        private _getFriendlyStringForPermission(p);
        private _createListElementForPermission(p, fadeIn?);
        private _onUpdateSortOrder(order);
        private _handleAutoCompleteSelect(event, ui);
        private _handleAutoCompleteRequest(request, response);
        private _assignIDsToListElements();
        private _onModified();
        private _onClickedOverlayBackground(event);
        private _removePopup();
        private _encodePermissionsString();
        private _debugPrint();
        private static InputFieldName;
        private static curUniqueDialogIdentifier;
        private _entryPermissionPopup;
        private _isReadOnly;
        private _hasHookedOverlay;
        private _listElementPrefix;
        private _qtip;
        private _permissionsListElement;
        private _permissions;
        private _newOrder;
        private _mainDiv;
        private _loadingDiv;
        private _wasCancelled;
        private _verifyPermissionsFunc;
        private _qtipAttachmentElement;
        private _hasThisDialogBeenRemoved;
    }
    interface VerifyPermissionsFunc {
        (newPermissions: string, onCompleted: (result: string) => void): void;
    }
    function Permission_Read(): string;
    function Permission_ReadWrite(): string;
    function Permission_None(): string;
    class Permission {
        static create(isGroup: boolean, id: string, permission: string): Permission;
        static createFromString(str: string): Permission;
        encode(): string;
        isPermissionReadOnly(): boolean;
        isPermissionReadWrite(): boolean;
        isPermissionNoAccess(): boolean;
        isGroup: boolean;
        id: string;
        permission: string;
        label: string;
        visualElement: HTMLElement;
        qtipDummyElement: HTMLElement;
    }
}

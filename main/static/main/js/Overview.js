/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var StudyOverview;
(function (StudyOverview) {
    'use strict';
    var attachmentIDs;
    var attachmentsByID;
    var prevDescriptionEditElement;
    // Called when the page loads.
    function prepareIt() {
        this.attachmentIDs = null;
        this.attachmentsByID = null;
        this.prevDescriptionEditElement = null;
        this.metabolicMapID = -1;
        this.metabolicMapName = null;
        this.biomassCalculation = -1;
        new EDDEditable.EditableElement($('#editable-study-name').get()[0]);
        new EDDEditable.EditableAutocomplete($('#editable-study-contact').get()[0]);
        new EditableDescriptionElement($('#editable-study-description').get()[0]);
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.disclose .discloseLink', function (e) {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });
        $.ajax({
            'url': '/study/' + EDDData.currentStudyID + '/edddata/',
            'type': 'GET',
            'error': function (xhr, status, e) {
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': function (data) {
                EDDData = $.extend(EDDData || {}, data);
            }
        });
        prepareTabs();
        $(window).on('load', preparePermissions);
    }
    StudyOverview.prepareIt = prepareIt;
    // Set up click-to-browse tabs
    function prepareTabs() {
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.pageSectionTabs div:not(.active)', function (e) {
            var div = $(e.target).closest('div');
            var targetTab;
            var targetabOverlay;
            if (div.hasClass('absoverlay')) {
                targetTab = div.next('div:not(.absoverlay)');
                targetabOverlay = div;
            }
            else {
                targetTab = div;
                targetabOverlay = targetTab.prev('.absoverlay');
            }
            var activeTabs = targetTab.closest('div.pageSectionTabs').children('div.active');
            activeTabs.removeClass('active');
            targetTab.addClass('active');
            targetabOverlay.addClass('active');
            var targetTabContentID = targetTab.attr('for');
            var activeNonOverlayTabEls = activeTabs.filter('div:not(.absoverlay)').get();
            // Hide the content section for whatever tabs were active, then show the one selected
            for (var i = 0; i < activeNonOverlayTabEls.length; i++) {
                var a = activeNonOverlayTabEls[i];
                var tabContentID = $(a).attr('for');
                $('#' + tabContentID).addClass('off');
            }
            $('#' + targetTabContentID).removeClass('off');
        });
    }
    function preparePermissions() {
        var user, group;
        user = new EDDAuto.User({
            container: $('#permission_user_box')
        });
        group = new EDDAuto.Group({
            container: $('#permission_group_box')
        });
        $('form.permissions')
            .on('change', ':radio', function (ev) {
            var radio = $(ev.target);
            $('.permissions').find(':radio').each(function (i, r) {
                $(r).closest('span').find('.autocomp').prop('disabled', !$(r).prop('checked'));
            });
            if (radio.prop('checked')) {
                radio.closest('span').find('.autocomp:visible').focus();
            }
        })
            .on('submit', function (ev) {
            var perm = {}, klass, auto;
            auto = $('form.permissions').find('[name=class]:checked');
            klass = auto.val();
            perm.type = $('form.permissions').find('[name=type]').val();
            perm[klass.toLowerCase()] = { 'id': auto.closest('span').find('input:hidden').val() };
            $.ajax({
                'url': '/study/' + EDDData.currentStudyID + '/permissions/',
                'type': 'POST',
                'data': {
                    'data': JSON.stringify([perm]),
                    'csrfmiddlewaretoken': $('form.permissions').find('[name=csrfmiddlewaretoken]').val()
                },
                'success': function () {
                    console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                    $('<div>').text('Set Permission').addClass('success')
                        .appendTo($('form.permissions')).delay(5000).fadeOut(2000);
                },
                'error': function (xhr, status, err) {
                    console.log(['Setting permission failed: ', status, ';', err].join(''));
                    $('<div>').text('Server Error: ' + err).addClass('bad')
                        .appendTo($('form.permissions')).delay(5000).fadeOut(2000);
                }
            });
            return false;
        })
            .find(':radio').trigger('change').end()
            .removeClass('off');
    }
    function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        }
        else {
            $("#metabolicMapName").html('(none)');
        }
    }
    StudyOverview.onChangedMetabolicMap = onChangedMetabolicMap;
    // They want to select a different metabolic map.
    function onClickedMetabolicMapName() {
        var _this = this;
        var ui, callback = function (error, metabolicMapID, metabolicMapName, finalBiomass) {
            if (!error) {
                _this.metabolicMapID = metabolicMapID;
                _this.metabolicMapName = metabolicMapName;
                _this.biomassCalculation = finalBiomass;
                _this.onChangedMetabolicMap();
            }
            else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }
    StudyOverview.onClickedMetabolicMapName = onClickedMetabolicMapName;
    var EditableDescriptionElement = (function (_super) {
        __extends(EditableDescriptionElement, _super);
        function EditableDescriptionElement() {
            _super.apply(this, arguments);
        }
        EditableDescriptionElement.prototype.editAllowed = function () {
            return EDDData.currentStudyWritable;
        };
        EditableDescriptionElement.prototype.canCommit = function (value) {
            return EDDData.currentStudyWritable;
        };
        EditableDescriptionElement.prototype.getValue = function () {
            return EDDData.Studies[EDDData.currentStudyID].description;
        };
        EditableDescriptionElement.prototype.setValue = function (value) {
            EDDData.Studies[EDDData.currentStudyID].description = value;
        };
        return EditableDescriptionElement;
    }(EDDEditable.EditableElement));
    StudyOverview.EditableDescriptionElement = EditableDescriptionElement;
})(StudyOverview || (StudyOverview = {}));
;
// use JQuery ready event shortcut to call prepareIt when page is ready
$(function () { return StudyOverview.prepareIt(); });

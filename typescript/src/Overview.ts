/// <reference path="typescript-declarations.d.ts" />
/// <reference path="Utl.ts" />
/// <reference path="Dragboxes.ts" />
/// <reference path="DataGrid.ts" />

declare var EDDData:EDDData;

module StudyOverview {
    'use strict';

    var attachmentIDs:any;
    var attachmentsByID:any;
    var prevDescriptionEditElement:any;

    // We can have a valid metabolic map but no valid biomass calculation.
    // If they try to show carbon balance in that case, we'll bring up the UI to 
    // calculate biomass for the specified metabolic map.
    export var metabolicMapID:any;
    export var metabolicMapName:any;
    export var biomassCalculation:number;


    // Called when the page loads.
    export function prepareIt() {

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
        $(document).on('click', '.disclose .discloseLink', (e) => {
            $(e.target).closest('.disclose').toggleClass('discloseHide');
            return false;
        });

        $.ajax({
            'url': '/study/' + EDDData.currentStudyID + '/edddata/',
            'type': 'GET',
            'error': (xhr, status, e) => {
                console.log(['Loading EDDData failed: ', status, ';', e].join(''));
            },
            'success': (data) => {
                EDDData = $.extend(EDDData || {}, data);
            }
        });

        prepareTabs();

        $(window).on('load', preparePermissions);
    }


    // Set up click-to-browse tabs
    function prepareTabs() {
        // put the click handler at the document level, then filter to any link inside a .disclose
        $(document).on('click', '.pageSectionTabs div:not(.active)', (e) => {
            var div = $(e.target).closest('div');

            var targetTab;
            var targetabOverlay;

            if (div.hasClass('absoverlay')) {
                targetTab = div.next('div:not(.absoverlay)');
                targetabOverlay = div;
            } else {
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
            for ( var i = 0; i < activeNonOverlayTabEls.length; i++ ) {
                var a = activeNonOverlayTabEls[i];
                var tabContentID = $(a).attr('for');
                $('#'+tabContentID).addClass('off');
            }
            $('#'+targetTabContentID).removeClass('off');
        });
    }


    function preparePermissions() {
        var user: EDDAuto.User, group: EDDAuto.Group;
        user = new EDDAuto.User({
            container:$('#permission_user_box')
        });
        group = new EDDAuto.Group({
            container:$('#permission_group_box')
        });

        $('form.permissions')
            .on('change', ':radio', (ev:JQueryInputEventObject):void => {
                var radio: JQuery = $(ev.target);
                $('.permissions').find(':radio').each((i: number, r: Element): void => {
                    $(r).closest('span').find('.autocomp').prop('disabled', !$(r).prop('checked'));
                });
                if (radio.prop('checked')) {
                    radio.closest('span').find('.autocomp:visible').focus();
                }
            })
            .on('submit', (ev:JQueryEventObject): boolean => {
                var perm: any = {}, klass: string, auto: JQuery;
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
                    'success': (): void => {
                        console.log(['Set permission: ', JSON.stringify(perm)].join(''));
                        $('<div>').text('Set Permission').addClass('success')
                            .appendTo($('form.permissions')).delay(5000).fadeOut(2000);
                    },
                    'error': (xhr, status, err): void => {
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


    export function onChangedMetabolicMap() {
        if (this.metabolicMapName) {
            // Update the UI to show the new filename for the metabolic map.
            $("#metabolicMapName").html(this.metabolicMapName);
        } else {
            $("#metabolicMapName").html('(none)');
        }
    }


    // They want to select a different metabolic map.
    export function onClickedMetabolicMapName():void {
        var ui:StudyMetabolicMapChooser,
            callback:MetabolicMapChooserResult = (error:string,
                metabolicMapID?:number,
                metabolicMapName?:string,
                finalBiomass?:number):void => {
            if (!error) {
                this.metabolicMapID = metabolicMapID;
                this.metabolicMapName = metabolicMapName;
                this.biomassCalculation = finalBiomass;
                this.onChangedMetabolicMap();
            } else {
                console.log("onClickedMetabolicMapName error: " + error);
            }
        };
        ui = new StudyMetabolicMapChooser(false, callback);
    }


    export class EditableDescriptionElement extends EDDEditable.EditableElement {

        editAllowed(): boolean {
            return EDDData.currentStudyWritable;
        }

        canCommit(value): boolean {
            return EDDData.currentStudyWritable;
        }

        getValue():string {
            return EDDData.Studies[EDDData.currentStudyID].description;
        }

        setValue(value) {
            EDDData.Studies[EDDData.currentStudyID].description = value;
        }
    }
};


// use JQuery ready event shortcut to call prepareIt when page is ready
$(() => StudyOverview.prepareIt());

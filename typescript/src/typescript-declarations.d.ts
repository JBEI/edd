/// <reference path="../typings/jquery/jquery.d.ts" />
/// <reference path="../typings/jquery/jqueryui.d.ts" />
/// <reference path="../typings/jquery/jquery.cookie.d.ts" />
/// <reference path="../typings/jquery/jquery.mcautocomplete.d.ts" />
/// <reference path="../typings/underscore/underscore.d.ts" />
/// <reference path="EDDDataInterface.ts" />


interface JQuery {
	qtip(stuff:any) : any;
	sortable(params:any) : any;					// from html.sortable library
	bindFirst(eventName:string, handler:any); 	// from jquery.bind-first library
	size():number;
	indexOf(element:any):any;
}

interface JQueryStatic {
	plot:any;
	color:any;
}


declare var FileDrop: any;
declare var tinymce: any;

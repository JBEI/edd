/// <reference path="lib/jquery/jquery.d.ts" />
/// <reference path="lib/jquery/jqueryui.d.ts" />
/// <reference path="lib/jquery/jquery.cookie.d.ts" />
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

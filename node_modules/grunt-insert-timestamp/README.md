# grunt-insert-timestamp

> Insert a timestamp into a file.

This Grunt plugin allows yout to insert a timestamp into a file in a format of your choosing. After switching from Ruby Sass+Compass to LibSass, I could no longer use the Ruby function for timestamping my files in a comment, and I was hardpressed to find a grunt plugin that performed such a simple function.

Before you ask: no, this plugin does not add timestamps to filenames. It simply inserts a timestamp *into* the files of your choosing, in a format you specify, with customizable text surrounding it. Whether you want the timestamp to show up in any of the various code comment formats, or with some supplemental text, or whatever, it shall be done.

## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-insert-timestamp --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-insert-timestamp');
```

## The "insert_timestamp" task

### Overview
In your project's Gruntfile, add a section named `insert_timestamp` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  insert_timestamp: {

    // Default options
    options: {
      prepend: true,
      append: false,
      format: 'yyyy-mm-dd HH:MM:ss o',
      template: '/* {timestamp} */',
      datetime: new Date(),
      insertNewlines: true
    },

    // Sample usage with css files
    css: {
      options: {
        prepend: false,
        append: true,
        template: '/*! CSS compiled on: {template} */'
      },
      files: [{
        // Use dynamic extend name
        expand: true,
        // Source dir
        cwd: 'src/css',
        // Match files
        src: ['**/*.css'],
        // Output files
        dest: 'dest/css',
        ext: '.css'
      }]
    },

    // Sample usage with js files
    js: {
      options: {
        // Uses default output of `Date()`
        format: false,
        template: '// JS compiled on: {template}\n\n',
        insertNewlines: false
      },
      files: [{
        // Use dynamic extend name
        expand: true,
        // Source dir
        cwd: 'src/js',
        // Match files
        src: ['**/*.js'],
        // Output files
        dest: 'dest/js',
        ext: '.js'
      }]
    }
  },
});
```

### Options

#### options.prepend
Type: `Boolean`
Default value: `true`

Insert the timestamp at the beginning of the file.

#### options.append
Type: `Boolean`
Default value: `false`

Insert the timestamp at the end of the file.

#### options.format
Type: `String` or `Boolean`
Default value: `'yyyy-mm-dd HH:MM:ss o'`

Format of the timestamp. This uses [node-dateformat](https://github.com/felixge/node-dateformat), which in turn is an adaptation of [dateFormat()](http://blog.stevenlevithan.com/archives/date-time-format) by Steven Levithan.

See the **Date Formatting** section below for formatting characters and named masks.

#### options.template
Type: `String`
Default value: `/* {timestamp} */`

Template string that contains the timestamp to be inserted. This makes use of [string-template](https://github.com/Matt-Esch/string-template) by Matt Esch. This string can be almost anything you want, as long as you include `{timestamp}` somewhere for the timestamp to be output to.

This is useful if you want the timestamp to be output in a specific kind of code comment, or even if you want to add supplementary text. If you want just the timestamo by itself, just use `'{timestamp}'`.

Currently, there is no way of adding your own keys to the template string.

#### options.datetime
Type: `Date`
Default value: `new Date()`

The datetime that will be output as a timestamp in the file. This must be passed via the constructor `new Date(foo)`, where `foo` is any of the parameters accepted by the [built-in Date constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date).

#### options.insertNewlines
Type: `Boolean`
Default value: `true`

Whether to insert newlines after prepended timestamps and before appended timestamps. If you are defining your own newlines in the template string with `\n`, you probably don't need this.

## Date Formatting

The available formatting characters are available:

Mask           | Description
-------------- | -----------
`d`            | Day of the month as digits; no leading zero for single-digit days.
`dd`           | Day of the month as digits; leading zero for single-digit days.
`ddd`          | Day of the week as a three-letter abbreviation.
`dddd`         | Day of the week as its full name.
`m`            | Month as digits; no leading zero for single-digit months.
`mm`           | Month as digits; leading zero for single-digit months.
`mmm`          | Month as a three-letter abbreviation.
`mmmm`         | Month as its full name.
`yy`           | Year as last two digits; leading zero for years less than 10.
`yyyy`         | Year represented by four digits.
`h`            | Hours; no leading zero for single-digit hours (12-hour clock).
`hh`           | Hours; leading zero for single-digit hours (12-hour clock).
`H`            | Hours; no leading zero for single-digit hours (24-hour clock).
`HH`           | Hours; leading zero for single-digit hours (24-hour clock).
`M`            | Minutes; no leading zero for single-digit minutes.
`MM`           | Minutes; leading zero for single-digit minutes.
`s`            | Seconds; no leading zero for single-digit seconds.
`ss`           | Seconds; leading zero for single-digit seconds.
`l` or `L`     | Milliseconds. l gives 3 digits. L gives 2 digits.
`t`            | Lowercase, single-character time marker string: a or p.
`tt`           | Lowercase, two-character time marker string: am or pm.
`T`            | Uppercase, single-character time marker string: A or P.
`TT`           | Uppercase, two-character time marker string: AM or PM.
`Z`            | US timezone abbreviation, e.g. EST or MDT. With non-US timezones or in the Opera browser, the GMT/UTC offset is returned, e.g. GMT-0500
`o`            | GMT/UTC timezone offset, e.g. -0500 or +0230.
`S`            | The date's ordinal suffix (st, nd, rd, or th). Works well with d.
`'…'` or `"…"` | Literal character sequence. Surrounding quotes are removed.
`UTC:`         | Must be the first four characters of the mask. Converts the date from local time to UTC/GMT/Zulu time before applying the mask. The "UTC:" prefix is removed.

You can also use "named masks" instead of strings of formatting characters like so:

```
format: 'isoDateTime'
// 2015-03-14T09:26:53
```

Name           | Mask                           | Example
-------------- | ------------------------------ | -------
default        | `ddd mmm dd yyyy HH:MM:ss`     | Sat Jun 09 2007 17:46:21
shortDate      | `m/d/yy`                       | 6/9/07
mediumDate     | `mmm d, yyyy`                  | Jun 9, 2007
longDate       | `mmmm d, yyyy`                 | June 9, 2007
fullDate       | `dddd, mmmm d, yyyy`           | Saturday, June 9, 2007
shortTime      | `h:MM TT`                      | 5:46 PM
mediumTime     | `h:MM:ss TT`                   | 5:46:21 PM
longTime       | `h:MM:ss TT Z`                 | 5:46:21 PM EST
isoDate        | `yyyy-mm-dd`                   | 2007-06-09
isoTime        | `HH:MM:ss`                     | 17:46:21
isoDateTime    | `yyyy-mm-dd'T'HH:MM:ss`        | 2007-06-09T17:46:21
isoUtcDateTime | `UTC:yyyy-mm-dd'T'HH:MM:ss'Z'` | 2007-06-09T22:46:21Z

## Release History
* 0.1.0 First release

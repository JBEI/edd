"""
Defines a decorator that will generate helpful deprecation warnings when used to annotate a
function.  This code is subject to the GPL 2.0 (http://www.gnu.org/licenses/gpl-2.0.html),
and originated at
https://wiki.python.org/moin/PythonDecoratorLibrary#Smart_deprecation_warnings_
.28with_valid_filenames.2C_line_numbers.2C_etc..29.

## Usage examples ##
@deprecated
def my_func():
    pass


@other_decorators_must_be_upper
@deprecated
def my_func():
    pass

"""

import warnings
import functools


def deprecated(func):
    '''This is a decorator which can be used to mark functions
    as deprecated. It will result in a warning being emitted
    when the function is used.'''

    @functools.wraps(func)
    def new_func(*args, **kwargs):
        warnings.warn_explicit("Call to deprecated function {}.".format(func.__name__),
            category=DeprecationWarning, filename=func.func_code.co_filename,
            lineno=func.func_code.co_firstlineno + 1)
        return func(*args, **kwargs)

    return new_func




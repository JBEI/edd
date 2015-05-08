
# XXX I hope some of this can be replaced by generic module functions

"""
Miscellaneous utilities for handling HTTP requests and responses.
"""

def extract_non_blank_string_from_form (form, param_name, allow_list=False,
    return_none_if_missing=False) :
  if (not param_name in form) :
    if return_none_if_missing :
      return None
    raise KeyError("The required parameter '%s' was not found in the "+
      "submitted form.")
  str_value = form[param_name]
  if isinstance(str_value, list) :
    if (not allow_list) :
      raise TypeError(("The parameter %s must be a scalar value, but a "+
        "list was submitted.") % param_name)
    return str_value
  if (str_value == "") :
    if return_none_if_missing :
      return None
    raise ValueError("The parameter '%s' must not be blank." % param_name)
  return str_value

def extract_integers_from_form (form, param_name, allow_list=False,
    return_none_if_missing=False) :
  return _extract_numbers_from_form(
    form=form,
    param_name=param_name,
    param_type="integer",
    allow_list=allow_list,
    return_none_if_missing=return_none_if_missing)

def extract_floats_from_form (form, param_name, allow_list=False,
    return_none_if_missing=False) :
  return _extract_numbers_from_form(
    form=form,
    param_name=param_name,
    param_type="decimal number",
    allow_list=allow_list,
    return_none_if_missing=return_none_if_missing)

def _extract_numbers_from_form (form, param_name, param_type, allow_list=False,
    return_none_if_missing=False) :
  factory = {
    'integer' : int,
    'decimal number' : float,
  }[param_type]
  str_value = extract_non_blank_string_from_form(
    form=form,
    param_name=param_name,
    allow_list=allow_list,
    return_none_if_missing=return_none_if_missing)
  if (str_value is None) :
    return None
  def convert (value) :
    try :
      return factory(value)
    except ValueError :
      raise ValueError(("The value '%s' specified for the parameter %s "+
        "is incorrect; this must be a %s") % (value, param_name, param_type))
  if isinstance(str_value, list) :
    values = []
    for value in str_value :
      values.append(convert(value))
    return values
  else :
    return convert(str_value)

-- This file contains the SQL commands used to convert the existing EDD/perl
---- schema data into the EDD/django schema

-- copy over users
INSERT INTO public.auth_user(
        id, password, last_login, is_superuser, username, first_name,
        last_name, email, is_staff, is_active, date_joined
    ) SELECT id, '', lastlogin_time, superuser,
        substring(lower(email) from '^[^@]*'), firstname, lastname, email,
        editor, TRUE, NOW()
    FROM old_edd.accounts;
-- Update sequence with the current maximum
SELECT setval('public.auth_user_id_seq', SELECT max(id) FROM public.auth_user);


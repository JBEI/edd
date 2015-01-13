-- This file contains the SQL commands used to convert the existing EDD/perl
---- schema data into the EDD/django schema


--
-- copy over users
--
INSERT INTO public.auth_user(
        id, password, last_login, is_superuser, username, first_name,
        last_name, email, is_staff, is_active, date_joined
    ) SELECT id, '', lastlogin_time, superuser,
        substring(lower(email) from '^[^@]*'), firstname, lastname, email,
        editor, TRUE, NOW()
    FROM old_edd.accounts;
-- Update sequence with the current maximum
SELECT setval('public.auth_user_id_seq', SELECT max(id) FROM public.auth_user);


--
-- copy over update timestamps
--
-- Created/Modified timestamps are foreign keys now; create timestamps for
---- studies first. Some modified timestamps have no user and 1831 timestamp;
---- these will use the creation time later.
INSERT INTO public.update_info(mod_time, mod_by_id)
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.studies
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.studies
    WHERE modified_by > 0
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.lines
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.lines
    WHERE modified_by > 0
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.assays
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.assays
    WHERE modified_by > 0
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.assay_measurements
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.assay_measurements
    WHERE modified_by > 0
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.assay_measurement_data
    WHERE modified_by > 0
    UNION
    -- protocols only has created_by and modification_time
    SELECT date_trunc('second', modification_time) AS update_time,
        created_by AS update_user
    FROM old_edd.protocols
    WHERE modified_by > 0
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.strains
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.strains
    WHERE modified_by > 0
    ORDER BY update_time;


--
-- copy over studies
--
INSERT INTO public.study(
        id, study_name, description, active, contact_extra, contact_id,
        created_id, updated_id
    ) SELECT s.id, s.study_name, s.additional_info, NOT s.disabled, s.contact,
        u.id, c.id, coalesce(m.id, c.id)
    FROM old_edd.studies s
    LEFT JOIN public.auth_user u ON lower(u.email) = lower(s.contact)
    LEFT JOIN public.update_info c ON c.mod_time = s.creation_time
        AND c.mod_by_id = s.created_by
    LEFT JOIN public.update_info m ON m.mod_time = s.modification_time
        AND m.mod_by_id = s.modified_by
    ORDER BY s.id;
-- Copy permissions; right now only group permission is special __Everyone__
INSERT INTO public.study_user_permission(permission_type, study_id, user_id)
    SELECT upper(right(sub.permission, 1)), sub.id, u.id FROM (
        SELECT id, regexp_split_to_table(permissions, ',') AS permission
            FROM old_edd.studies
        ) sub
    INNER JOIN old_edd.accounts u ON sub.permission ~ u.ldap_id
    ORDER BY sub.id;
-- Converting __Everyone__ permissions to ESE
INSERT INTO public.study_group_permission(permission_type, study_id, group_id)
    SELECT upper(right(sub.permission, 1)), sub.id, g.id FROM (
        SELECT id, regexp_split_to_table(permissions, ',') AS permission
            FROM old_edd.studies
        ) sub
    INNER JOIN public.auth_group g ON g.name = 'ESE'
    WHERE sub.permission ~ 'g:__Everyone__'
    ORDER BY sub.id;
-- For now, skipping migration of metabolic maps
-- Update study sequence with current maximum value
SELECT setval('public.study_id_seq', SELECT max(id) FROM public.study);


--
-- copy over lines
--
INSERT INTO public.line(
        id, line_name, active, contact_extra, contact_id, experimenter_id,
        study_id, created_id, modified_id
    ) SELECT l.id, l.line_name, NOT l.disabled, l.contact, u.id,
        CASE WHEN l.experimenter = 0 THEN NULL ELSE l.experimenter END,
        l.study_id, c.id, coalesce(m.id, c.id)
    FROM old_edd.lines l
    LEFT JOIN public.auth_user u ON lower(u.email) = lower(l.contact)
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', l.creation_time)
        AND c.mod_by_id = l.created_by
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', l.modification_time)
        AND m.mod_by_id = l.created_by
    ORDER BY l.id;
-- Update line sequence with current maximum value
SELECT setval('public.line_id_seq', SELECT max(id) FROM public.line);


--
-- copy over protocols
--



--
-- copy over assays
--



--
-- copy over assay_measurements
--



--
-- copy over strains
--


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
SELECT setval('public.auth_user_id_seq', max(id)) FROM public.auth_user;


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
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) = 
        date_trunc('second', s.creation_time)
        AND c.mod_by_id = s.created_by
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', s.modification_time)
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
SELECT setval('public.study_id_seq', max(id)) FROM public.study;


--
-- copy over lines
--
INSERT INTO public.line(
        id, line_name, active, contact_extra, contact_id, experimenter_id,
        study_id, created_id, updated_id
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
        AND m.mod_by_id = l.modified_by
    ORDER BY l.id;
-- Update line sequence with current maximum value
SELECT setval('public.line_id_seq', max(id)) FROM public.line;


--
-- copy over protocols
--
INSERT INTO public.protocol(
        id, protocol_name, description, active, owned_by_id, variant_of_id, 
        created_id, updated_id
    ) SELECT p.id, p.protocol_name, p.description, NOT p.disabled,
        CASE WHEN p.owned_by = 0 THEN 5 ELSE p.owned_by END,
        CASE WHEN p.variant_of_id = 0 THEN NULL ELSE p.variant_of_id END,
        c.id, c.id
    FROM old_edd.protocols p
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', p.modification_time)
        AND c.mod_by_id = p.created_by
    ORDER BY p.id;
-- Update protocol sequence with current maximum value
SELECT setval('public.protocol_id_seq', max(id)) FROM public.protocol;


--
-- copy over assays
--
INSERT INTO public.assay(
        id, assay_name, description, active, experimenter_id, line_id,
        protocol_id, created_id, updated_id
    ) SELECT a.id, a.assay_name, coalesce(a.description, ''), NOT a.disabled,
        CASE WHEN a.experimenter = 0 THEN NULL ELSE a.experimenter END,
        a.line_id, a.protocol_id, c.id, coalesce(m.id, c.id)
    FROM old_edd.assays a
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', a.creation_time)
        AND c.mod_by_id = a.created_by
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.modification_time)
        AND m.mod_by_id = a.modified_by
    ORDER BY a.id;
-- Update protocol sequence with current maximum value
SELECT setval('public.assay_id_seq', max(id)) FROM public.assay;


--
-- copy over measurement_type
--
INSERT INTO public.measurement_type(
        id, type_name, short_name, type_group
    ) SELECT m.measurement_type_id, m.type_name, m.short_name, 'm'
    FROM old_edd.metabolite_types m
    ORDER BY m.measurement_type_id;
INSERT INTO public.metabolite(
        measurementtype_ptr_id, charge, carbon_count, molar_mass,
        molecular_formula
    ) SELECT m.measurement_type_id,
        CASE WHEN m.charge = '' OR m.charge IS NULL THEN 0
        ELSE CAST(m.charge AS integer) END,
        CASE WHEN m.carbon_count IS NULL THEN 0 ELSE m.carbon_count END,
        CASE WHEN m.molar_mass IS NULL THEN 0 ELSE m.molar_mass END,
        coalesce(m.molecular_formula, '')
    FROM old_edd.metabolite_types m
    ORDER BY m.measurement_type_id;
INSERT INTO public.measurement_type(
        id, type_name, short_name, type_group
    ) SELECT g.measurement_type_id, g.name, '', 'g'
    FROM old_edd.gene_identifiers g
    ORDER BY g.measurement_type_id;
INSERT INTO public.gene_identifier(
        measurementtype_ptr_id, location_in_genome, positive_strand,
        location_start, location_end, gene_length
    ) SELECT g.measurement_type_id, g.location_in_genome,
        g.positive_strand IS NULL, g.location_start, g.location_end,
        g.gene_length
    FROM old_edd.gene_identifiers g
    ORDER BY g.measurement_type_id;
INSERT INTO public.measurement_type(
        id, type_name, short_name, type_group
    ) SELECT p.measurement_type_id, p.name, '', 'p'
    FROM old_edd.protein_identifiers p
    ORDER BY p.measurement_type_id;
SELECT setval('public.measurement_type_id_seq', max(id))
    FROM public.measurement_type;
INSERT INTO public.measurement_unit(
        id, unit_name, display, type_group
    ) SELECT u.id, u.unit_name, u.display, CASE
        WHEN u.used_for_metabolites THEN 'm'
        WHEN u.used_for_transcriptions THEN 'g'
        WHEN u.used_for_proteins THEN 'p'
        ELSE '_' END
    FROM old_edd.measurement_units u
    ORDER BY u.id;
SELECT setval('public.measurement_unit_id_seq', max(id))
    FROM public.measurement_type;


--
-- copy over assay_measurements
--
INSERT INTO public.measurement(
        id, assay_id, measurement_type_id, experimenter_id, active, created_id,
        updated_id
    ) SELECT a.id, a.assay_id, a.measurement_type_id,
        CASE WHEN a.experimenter = 0 THEN NULL ELSE a.experimenter END,
        NOT a.disabled, c.id, coalesce(m.id, c.id)
    FROM old_edd.assay_measurements a
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', a.creation_time)
        AND c.mod_by_id = a.created_by
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.modification_time)
        AND m.mod_by_id = a.modified_by
    ORDER BY a.id;
SELECT setval('public.measurement_id_seq', max(id)) FROM public.measurement;
INSERT INTO public.measurement_datum(
        measurement_id, x, y, x_units_id, y_units_id, updated_id
    ) SELECT a.id, am.x, am.y,
        CASE WHEN a.x_axis_units = 0 THEN 1 ELSE a.x_axis_units END,
        CASE WHEN a.y_axis_units = 0 THEN 1 ELSE a.y_axis_units END,
        m.id
    FROM old_edd.assay_measurements a
    INNER JOIN old_edd.assay_measurement_data am ON am.measurement_id = a.id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', am.modification_time)
        AND m.mod_by_id = am.modified_by
    WHERE a.measurement_type_compartment = 0
    ORDER BY a.id;
INSERT INTO public.measurement_vector(
        measurement_id, x, y, x_units_id, y_units_id, updated_id
    ) SELECT a.id, am.x, coalesce(am.yvector, ''),
        CASE WHEN a.x_axis_units = 0 THEN 1 ELSE a.x_axis_units END,
        CASE WHEN a.y_axis_units = 0 THEN 1 ELSE a.y_axis_units END,
        m.id
    FROM old_edd.assay_measurements a
    INNER JOIN old_edd.assay_measurement_data am ON am.measurement_id = a.id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', am.modification_time)
        AND m.mod_by_id = am.modified_by
    WHERE a.measurement_type_compartment = 1
    ORDER BY a.id;


--
-- copy over strains
--
INSERT INTO public.strain(
        id, strain_name, registry_id, registry_url, created_id, updated_id
    ) SELECT s.id, coalesce(sr.label, s.strain_name), s.registry_record_id,
        sr.url, c.id, coalesce(m.id, c.id)
    FROM old_edd.strains s
    LEFT JOIN old_edd.strains_registry sr ON sr.id = s.registry_record_id
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', s.creation_time)
        AND c.mod_by_id = s.created_by
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', s.modification_time)
        AND m.mod_by_id = s.modified_by
    ORDER BY s.id;
SELECT setval('public.strain_id_seq', max(id)) FROM public.strain;



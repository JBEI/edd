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
INSERT INTO public.profile_institution(institution_name)
    VALUES ('Lawrence Berkeley National Lab');
INSERT INTO public.profile_user(initials, user_id)
    SELECT u.initials, u.id
    FROM old_edd.accounts u;
-- Add everyone to LBNL, copy ldap ID if there
INSERT INTO public.profile_institution_user(identifier, profile_id, institution_id)
    SELECT a.ldap_id, p.id, 1
    FROM old_edd.accounts a
    INNER JOIN public.profile_user p ON p.user_id = a.id
    ORDER BY p.id;
-- Make sure there is an ESE group for later
INSERT INTO public.auth_group(name) VALUES ('ESE');

--
-- copy over update timestamps
--
-- Created/Modified timestamps are foreign keys now; create timestamps for
---- studies first. Some modified timestamps have no user and 1831 timestamp;
---- these will use the creation time later. Truncate to the second to try
---- aggregating "updates" milliseconds apart into a single time
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
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.comments
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.attachments
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.metadata_values
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.carbon_sources
    UNION
    SELECT date_trunc('second', modification_time) AS update_time,
        modified_by AS update_user
    FROM old_edd.carbon_sources
    WHERE modified_by > 0
    UNION
    SELECT date_trunc('second', creation_time) AS update_time,
        created_by AS update_user
    FROM old_edd.attachments
    ORDER BY update_time;


--
-- copy over studies
--
-- edd_object entries won't exist yet, make a temp column to track
ALTER TABLE public.edd_object ADD COLUMN study_id integer UNIQUE DEFAULT NULL;
INSERT INTO public.edd_object(study_id, name, description)
    SELECT id, study_name, additional_info FROM old_edd.studies ORDER BY id;
INSERT INTO public.study(
        active, contact_extra, contact_id, object_ref_id
    ) SELECT NOT s.disabled, s.contact, u.id, o.id
    FROM old_edd.studies s
    INNER JOIN public.edd_object o ON o.study_id = s.id
    LEFT JOIN public.auth_user u ON lower(u.email) = lower(s.contact)
    ORDER BY s.id;
-- add create/update to edd_object
INSERT INTO public.edd_object_update(eddobject_id, update_id)
    SELECT o.id, c.id
    FROM public.edd_object o
    INNER JOIN old_edd.studies s ON s.id = o.study_id
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) = 
        date_trunc('second', s.creation_time)
        AND c.mod_by_id = s.created_by
    UNION
    SELECT o.id, m.id
    FROM public.edd_object o
    INNER JOIN old_edd.studies s ON s.id = o.study_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', s.modification_time)
        AND m.mod_by_id = s.modified_by
    WHERE s.modified_by > 0;
-- Copy permissions; right now only group permission is special __Everyone__
INSERT INTO public.study_user_permission(permission_type, study_id, user_id)
    SELECT upper(right(sub.permission, 1)), o.id, u.id FROM (
        SELECT id, regexp_split_to_table(permissions, ',') AS permission
            FROM old_edd.studies
        ) sub
    INNER JOIN old_edd.accounts u ON sub.permission ~ u.ldap_id
    INNER JOIN public.edd_object o ON o.study_id = sub.id
    ORDER BY sub.id;
-- Converting __Everyone__ permissions to ESE
INSERT INTO public.study_group_permission(permission_type, study_id, group_id)
    SELECT upper(right(sub.permission, 1)), o.id, g.id FROM (
        SELECT id, regexp_split_to_table(permissions, ',') AS permission
            FROM old_edd.studies
        ) sub
    INNER JOIN public.auth_group g ON g.name = 'ESE'
    INNER JOIN public.edd_object o ON o.study_id = sub.id
    WHERE sub.permission ~ 'g:__Everyone__'
    ORDER BY sub.id;
-- For now, skipping migration of metabolic maps


--
-- copy over strains
--
-- edd_object entries won't exist yet, make a temp column to track
ALTER TABLE public.edd_object ADD COLUMN strain_id integer UNIQUE DEFAULT NULL;
INSERT INTO public.edd_object(strain_id, name)
    SELECT s.id, coalesce(sr.label, s.strain_name)
    FROM old_edd.strains s
    LEFT JOIN old_edd.strains_registry sr ON sr.id = s.registry_record_id
    ORDER BY id;
INSERT INTO public.strain(
        registry_id, registry_url, object_ref_id
    ) SELECT s.registry_record_id, sr.url, o.id
    FROM old_edd.strains s
    INNER JOIN public.edd_object o ON o.strain_id = s.id
    LEFT JOIN old_edd.strains_registry sr ON sr.id = s.registry_record_id
    ORDER BY s.id;
-- add create/update to edd_object
INSERT INTO public.edd_object_update(eddobject_id, update_id)
    SELECT o.id, c.id
    FROM public.edd_object o
    INNER JOIN old_edd.strains s ON s.id = o.strain_id
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', s.creation_time)
        AND c.mod_by_id = s.created_by
    UNION
    SELECT o.id, m.id
    FROM public.edd_object o
    INNER JOIN old_edd.strains s ON s.id = o.strain_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', s.modification_time)
        AND m.mod_by_id = s.modified_by
    WHERE s.modified_by > 0;


--
-- copy over carbon sources
--
------ TODO


--
-- copy over metadata types
--
INSERT INTO public.metadata_group (id, group_name)
    SELECT g.id, g.group_name
    FROM old_edd.metadata_groups g;
SELECT setval('public.metadata_group_id_seq', max(id))
    FROM public.metadata_group;
INSERT INTO public.metadata_type (
        id, type_name, input_size, default_value, prefix, postfix, for_context,
        group_id
    ) SELECT t.id, t.type_name, t.input_size, t.default_value, t.prefix,
        t.postfix, CASE WHEN t.line_level AND t.protocol_level THEN 'LP'
        WHEN t.line_level THEN 'L'
        WHEN t.protocol_level THEN 'P'
        ELSE 'S' END, t.metadata_group_id
    FROM old_edd.metadata_types t;
SELECT setval('public.metadata_type_id_seq', max(id))
    FROM public.metadata_type;
WITH grp AS (
    INSERT INTO public.metadata_group (group_name)
    VALUES ('Growth') RETURNING id
) INSERT INTO public.metadata_type (
        type_name, input_size, default_value, prefix, postfix, for_context,
        group_id)
    SELECT 'Media', 10, '--', '', '', 'L', grp.id FROM grp;


--
-- copy over lines
--
-- edd_object entries won't exist yet, make a temp column to track
ALTER TABLE public.edd_object ADD COLUMN line_id integer UNIQUE DEFAULT NULL;
INSERT INTO public.edd_object(line_id, name)
    SELECT id, line_name FROM old_edd.lines ORDER BY id;
INSERT INTO public.line(
        control, active, contact_extra, contact_id, experimenter_id,
        object_ref_id, study_id
    ) SELECT l.is_control, NOT l.disabled, l.contact, u.id,
        CASE WHEN l.experimenter = 0 THEN NULL ELSE l.experimenter END,
        o.id, os.id
    FROM old_edd.lines l
    INNER JOIN public.edd_object o ON o.line_id = l.id
    INNER JOIN public.edd_object os ON os.study_id = l.study_id
    LEFT JOIN public.auth_user u ON lower(u.email) = lower(l.contact)
    ORDER BY l.id;
-- add create/update to edd_object
INSERT INTO public.edd_object_update(eddobject_id, update_id)
    SELECT o.id, c.id
    FROM public.edd_object o
    INNER JOIN old_edd.lines l ON l.id = o.line_id
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', l.creation_time)
        AND c.mod_by_id = l.created_by
    UNION
    SELECT o.id, m.id
    FROM public.edd_object o
    INNER JOIN old_edd.lines l ON l.id = o.line_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', l.modification_time)
        AND m.mod_by_id = l.modified_by
    WHERE l.modified_by > 0;
-- handle replicate IDs
CREATE TEMP TABLE replicate(
    line_id integer PRIMARY KEY,
    replicate_id integer NOT NULL);
INSERT INTO replicate SELECT o.id, min(ro.id)
    FROM old_edd.lines l
    INNER JOIN old_edd.lines rl ON rl.replicate_id = l.replicate_id
        AND rl.study_id = l.study_id
    INNER JOIN public.edd_object o ON o.line_id = l.id
    INNER JOIN public.edd_object ro ON ro.line_id = rl.id 
    WHERE l.replicate_id > 0
    GROUP BY o.id ORDER BY o.id;
UPDATE public.line l SET replicate_id = r.replicate_id
    FROM replicate r
    WHERE r.line_id = l.object_ref_id;
DROP TABLE replicate;
-- and metadata
INSERT INTO public.metadata(
        data_value, data_type_id, edd_object_id, updated_id
    ) SELECT m.data_value, m.metadata_type_id, o.id, u.id
    FROM old_edd.metadata_values m
    INNER JOIN public.edd_object o ON o.line_id = m.line_id
    LEFT JOIN public.update_info u ON date_trunc('second', u.mod_time) =
        date_trunc('second', m.modification_time)
        AND u.mod_by_id = m.modified_by
    ORDER BY m.id;
-- media_type column converting to metadata value
INSERT INTO public.metadata(
        data_value, data_type_id, edd_object_id, updated_id
    ) SELECT l.media_type, t.id, o.id, u.id
    FROM old_edd.lines l
    INNER JOIN public.metadata_type t ON t.type_name = 'Media'
    INNER JOIN public.edd_object o ON o.line_id = l.id
    INNER JOIN public.update_info u ON date_trunc('second', u.mod_time) =
        date_trunc('second', l.modification_time)
        AND u.mod_by_id = l.modified_by
    WHERE l.media_type <> '' AND l.media_type <> '--'
    ORDER BY l.id;


--
-- copy over protocols
--
-- edd_object entries won't exist yet, make a temp column to track
ALTER TABLE public.edd_object ADD COLUMN protocol_id integer UNIQUE DEFAULT NULL;
INSERT INTO public.edd_object(protocol_id, name, description)
    SELECT id, protocol_name, description FROM old_edd.protocols ORDER BY id;
INSERT INTO public.protocol(
        active, object_ref_id, owned_by_id, variant_of_id
    ) SELECT NOT p.disabled, o.id,
        CASE WHEN p.owned_by = 0 THEN 5 ELSE p.owned_by END, v.id
    FROM old_edd.protocols p
    INNER JOIN public.edd_object o ON o.protocol_id = p.id
    LEFT JOIN public.edd_object v ON v.protocol_id = p.variant_of_id
    ORDER BY p.id;
-- add create to edd_object
INSERT INTO public.edd_object_update(eddobject_id, update_id)
    SELECT o.id, c.id
    FROM public.edd_object o
    INNER JOIN old_edd.protocols p ON p.id = o.protocol_id
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', p.modification_time)
        AND c.mod_by_id = p.created_by;


--
-- copy over assays
--
-- edd_object entries won't exist yet, make a temp column to track
ALTER TABLE public.edd_object ADD COLUMN assay_id integer UNIQUE DEFAULT NULL;
INSERT INTO public.edd_object(assay_id, name, description)
    SELECT id, assay_name, description FROM old_edd.assays ORDER BY id;
INSERT INTO public.assay(
        active, experimenter_id, line_id, object_ref_id, protocol_id
    ) SELECT NOT a.disabled,
        CASE WHEN a.experimenter = 0 THEN NULL ELSE a.experimenter END,
        ol.id, o.id, op.id
    FROM old_edd.assays a
    INNER JOIN public.edd_object o ON o.assay_id = a.id
    INNER JOIN public.edd_object ol ON ol.line_id = a.line_id
    INNER JOIN public.edd_object op ON op.protocol_id = a.protocol_id
    ORDER BY a.id;
-- add create/update to edd_object
INSERT INTO public.edd_object_update(eddobject_id, update_id)
    SELECT o.id, c.id
    FROM public.edd_object o
    INNER JOIN old_edd.assays a ON a.id = o.assay_id
    LEFT JOIN public.update_info c ON date_trunc('second', c.mod_time) =
        date_trunc('second', a.creation_time)
        AND c.mod_by_id = a.created_by
    UNION
    SELECT o.id, m.id
    FROM public.edd_object o
    INNER JOIN old_edd.assays a ON a.id = o.assay_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.modification_time)
        AND m.mod_by_id = a.modified_by
    WHERE a.modified_by > 0;
-- and metadata
INSERT INTO public.metadata(
        data_value, data_type_id, edd_object_id, updated_id
    ) SELECT m.data_value, m.metadata_type_id, o.id, u.id
    FROM old_edd.metadata_values m
    INNER JOIN public.edd_object o ON o.assay_id = m.assay_id
    LEFT JOIN public.update_info u ON date_trunc('second', u.mod_time) =
        date_trunc('second', m.modification_time)
        AND u.mod_by_id = m.modified_by
    ORDER BY m.id;


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
        id, assay_id, measurement_type_id, experimenter_id, active,
        update_ref_id, measurement_format, compartment
    ) SELECT a.id, ao.id, a.measurement_type_id,
        CASE WHEN a.experimenter = 0 THEN NULL ELSE a.experimenter END,
        NOT a.disabled, m.id, a.measurement_type_format,
        a.measurement_type_compartment
    FROM old_edd.assay_measurements a
    INNER JOIN public.edd_object ao ON ao.assay_id = a.assay_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        CASE WHEN a.modified_by = 0
        THEN date_trunc('second', a.creation_time)
        ELSE date_trunc('second', a.modification_time) END
        AND m.mod_by_id = CASE WHEN a.modified_by = 0
        THEN a.created_by ELSE a.modified_by END
    ORDER BY a.id;
SELECT setval('public.measurement_id_seq', max(id)) FROM public.measurement;
-- copy data values
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
    WHERE am.y IS NOT NULL
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
    WHERE am.yvector IS NOT NULL
    ORDER BY a.id;

--
-- copy over metabolic maps
--
ALTER TABLE public.edd_object ADD COLUMN metabolic_map_id integer UNIQUE DEFAULT NULL;
INSERT INTO public.edd_object(metabolic_map_id, name)
    SELECT id, biomass_exchange_name FROM old_edd.metabolic_maps ORDER BY id;
INSERT INTO public.metabolic_map(
        biomass_exchange_name, biomass_calculation, biomass_calculation_info,
        object_ref_id
    ) SELECT mm.biomass_exchange_name, mm.biomass_calculation,
        mm.biomass_calculation_info, o.id
    FROM old_edd.metabolic_maps mm
    INNER JOIN public.edd_object o ON o.metabolic_map_id = mm.id
    ORDER BY mm.id;
INSERT INTO public.measurement_type_to_exchange(
        metabolic_map_id, measurement_type_id, reactant_name, exchange_name
    ) SELECT o.id, me.measurement_type_id, me.reactant_name, me.exchange_name
    FROM old_edd.measurement_types_to_exchanges me
    INNER JOIN public.edd_object o ON o.metabolic_map_id = me.metabolic_map_id
    ORDER BY me.metabolic_map_id;
INSERT INTO public.measurement_type_to_species(
        metabolic_map_id, measurement_type_id, species
    ) SELECT o.id, ms.measurement_type_id, ms.species_id
    FROM old_edd.measurement_types_to_species ms
    INNER JOIN public.edd_object o ON o.metabolic_map_id = ms.metabolic_map_id
    ORDER BY ms.id;

--
-- copy over attachments
--
INSERT INTO public.attachment(
      id, object_ref_id, filename, file, description, created_id, mime_type,
      file_size
    ) SELECT a.id, so.id, a.filename, a.filename, a.description, m.id,
        a.mime_type, a.file_size
    FROM old_edd.attachments a
    INNER JOIN public.edd_object so ON so.study_id = a.study_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.creation_time)
        AND m.mod_by_id = a.created_by
    WHERE a.study_id != 0
    ORDER BY a.id;
INSERT INTO public.attachment(
      id, object_ref_id, filename, file, description, created_id, mime_type,
      file_size
    ) SELECT a.id, lo.id, a.filename, a.filename, a.description, m.id,
        a.mime_type, a.file_size
    FROM old_edd.attachments a
    INNER JOIN public.edd_object lo ON lo.line_id = a.line_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.creation_time)
        AND m.mod_by_id = a.created_by
    WHERE a.line_id != 0
    ORDER BY a.id;
INSERT INTO public.attachment(
      id, object_ref_id, filename, file, description, created_id, mime_type,
      file_size
    ) SELECT a.id, ao.id, a.filename, a.filename, a.description, m.id,
        a.mime_type, a.file_size
    FROM old_edd.attachments a
    INNER JOIN public.edd_object ao ON ao.assay_id = a.assay_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.creation_time)
        AND m.mod_by_id = a.created_by
    WHERE a.assay_id != 0
    ORDER BY a.id;
INSERT INTO public.attachment(
      id, object_ref_id, filename, file, description, created_id, mime_type,
      file_size
    ) SELECT a.id, po.id, a.filename, a.filename, a.description, m.id,
        a.mime_type, a.file_size
    FROM old_edd.attachments a
    INNER JOIN public.edd_object po ON po.protocol_id = a.protocol_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.creation_time)
        AND m.mod_by_id = a.created_by
    WHERE a.assay_id != 0
    ORDER BY a.id;
INSERT INTO public.attachment(
      id, object_ref_id, filename, file, description, created_id, mime_type,
      file_size
    ) SELECT a.id, mo.id, a.filename, a.filename, a.description, m.id,
        a.mime_type, a.file_size
    FROM old_edd.attachments a
    INNER JOIN public.edd_object mo ON mo.metabolic_map_id = a.metabolic_map_id
    LEFT JOIN public.update_info m ON date_trunc('second', m.mod_time) =
        date_trunc('second', a.creation_time)
        AND m.mod_by_id = a.created_by
    WHERE a.metabolic_map_id != 0
    ORDER BY a.id;

-- drop temp columns
ALTER TABLE public.edd_object DROP COLUMN study_id;
ALTER TABLE public.edd_object DROP COLUMN strain_id;
ALTER TABLE public.edd_object DROP COLUMN line_id;
ALTER TABLE public.edd_object DROP COLUMN protocol_id;
ALTER TABLE public.edd_object DROP COLUMN assay_id;
ALTER TABLE public.edd_object DROP COLUMN metabolic_map_id;

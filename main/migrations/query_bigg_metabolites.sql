WITH x AS ( -- map molecule names to formula/charge, with count of distinct formulas
	SELECT p.id, p.bigg_id, p.name, m.formula, m.charge, count(1) AS repeat
		FROM component p
		INNER JOIN compartmentalized_component cc ON p.id = cc.component_id
		INNER JOIN model_compartmentalized_component m ON m.compartmentalized_component_id = cc.id
		GROUP BY p.id, p.bigg_id, p.name, m.formula, m.charge
		ORDER BY p.name ASC, m.formula ASC
	), y AS ( -- grab total entries for molecule names
	SELECT x.id, sum(x.repeat) AS total
		FROM x
		GROUP BY x.id
	)
-- when name has formula at end, strip off formula
SELECT x.bigg_id, trim(regexp_replace(x.name, x.formula || '$', '')) AS name, x.formula, x.charge
	FROM x
	INNER JOIN y ON x.id = y.id
	WHERE
		-- skip blank formulas
		x.formula <> ''
		-- skip obvious placeholder formulas like 'R', 'X', 'Z'
		-- or where more than 3 lowercase letters in a row
		AND x.formula !~ '[RXZ][A-Z0-9]*$'
		AND x.formula !~ '[a-z]{3}'
	GROUP BY x.bigg_id, x.name, x.formula, x.charge, x.repeat, y.total
	-- throw out anything without supermajority agreement on formula
	HAVING x.repeat/y.total > 0.66
	ORDER BY x.name ASC, x.formula ASC
	;


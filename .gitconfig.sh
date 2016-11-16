[filter "ts-timestamp"]
    clean = "sed -e \"/^\\/\\/ Compiled to JS on: .*$/d\" -e \"/^\\/\\/ File last modified on: .*$/d\" -e \"/^\\/\\/# sourceMappingURL=.*$/d\""
    smudge = cat
[merge]
    renormalize=true

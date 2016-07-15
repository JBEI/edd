import hashlib

# File to check
assay_file_name = ['../fixtures/newshots/groupedAssay.png',
                   '../fixtures/newshots/linechart.png',
                   '../fixtures/newshots/single.png',
                   '../fixtures/newshots/timeBar.png']

# Correct original md5 goes here from fixtures/originalshots
original_md5_assay = ['d6d3bbc3981d4cc782653aa91cfa920a',
                      '294bbd84b8276e8b696e9b307a7409b0',
                      '480184f1c8f23a8df887297ec6dac253',
                      'b25f14a9358025f2d18820391d5b294a']


# Open,close, read file and calculate MD5 on its contents
for index in range(len(assay_file_name)):

    file = assay_file_name[index]

    with open(file) as file_to_check:
        # read contents of the file
        data = file_to_check.read()
        # pipe contents of the file through
        md5_returned = hashlib.md5(data).hexdigest()

        print(md5_returned)

    # # Compare original MD5 with freshly calculated MD5 hash
    if original_md5_assay[index] == md5_returned:
        print(file[21:] + ": MD5 verified.")
    else:
        print(file[21:] + ": MD5 verification failed!.")

print('done')

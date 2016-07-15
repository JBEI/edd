import hashlib

# File to check
file_name = 'fixtures/originalshots/linechart.png'

# Correct original md5 goes here
original_md5 = '294bbd84b8276e8b696e9b307a7409b0'

# Open,close, read file and calculate MD5 on its contents
with open(file_name) as file_to_check:
    # read contents of the file
    data = file_to_check.read()
    # pipe contents of the file through
    md5_returned = hashlib.md5(data).hexdigest()

    print(md5_returned)
# # Finally compare original MD5 with freshly calculated


if original_md5 == md5_returned:
    print("MD5 verified.")
else:
    print("MD5 verification failed!.")

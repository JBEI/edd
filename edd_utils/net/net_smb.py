from smb.SMBConnection import SMBConnection
from smb.smb_structs import OperationFailure
import pickle as pkl
import sys, os


class SMBController:

	username = "guest"
	password = ""
	request_identifier = "edd-smb-command"
	server_name = "SMB"
	domain = ""
	host = "smb.jbei.org"
	use_ntlm_v2 = True
	port = 139

	def _connect_(self):
		conn = SMBConnection(self.username, self.password, self.request_identifier, self.server_name, domain=self.domain, use_ntlm_v2=self.use_ntlm_v2)
		assert conn.connect(self.host, port=self.port)
		return conn

	def retrieve_folder_listing(self, volume, path):
		conn = self._connect_()
		folders = []
		files = []
		folder_contents = conn.listPath(volume, path)
		for item in folder_contents:
			filename = item.filename
			if item.isDirectory:
				if filename != "." and filename != "..":
					folders.append(filename)
			else:
				files.append(filename)
		return (folders, files)

	def retrieve_file(self, volume, remote_path, local_path):
		conn = self._connect_()
		local_file = open(local_path, "wb")
		file_attributes, file_size = conn.retrieveFile(volume,remote_path,local_file)
		local_file.close()

	# Walk through all the files on the given path.
	# Returns a list of the full path to each file.
	def walk_files(self, volume, path="/"):
		conn = self._connect_()
		files = []
		try:
			folder_contents = conn.listPath(volume, path)
			for item in folder_contents:
				filename = item.filename
				if item.isDirectory:
					if filename != "." and filename != "..":
						files = files + self.walk_files(volume, path+filename+"/")
				else:
					files.append(path+filename)
			return files
		except (OperationFailure,KeyError):
			return []

	# def collect_files_of_type(self, volume, filetype, path="/"):
	# 	pass

#
##
###
##
#

if __name__ == "__main__":
	# Walk through remote system, collecting all spreadsheets and copying them to the local drive.
	# TODO: not if they have already been copied
	# TODO: remote checksum for verification
	smb = SMBController()

	volume = "instrumentdata"
	# remote_folder_path = "/SPMAX-M2-02/"
	remote_folder_path = "/SPMAX-M2-02/Jason/"
	files = smb.walk_files(volume, path=remote_folder_path)
	for remote_file_path in files:
		# if remote_file_path.endswith(".xls") or remote_file_path.endswith(".xlsx") or remote_file_path.endswith(".csv") or remote_file_path.endswith(".xlsm") or remote_file_path.endswith(".xlsb"):
		if remote_file_path.endswith(".xls") or remote_file_path.endswith(".xlsx"):
			local_file_path = "output/" + os.path.split(remote_file_path)[1]
			smb.retrieve_file(volume, remote_file_path, local_file_path)
			print(remote_file_path)

	# files, folders = smb.retrieve_folder_listing("instrumentdata", path="/SPMAX-M2-02/Carolina/DEG/Old/")


	# volume = "instrumentdata"
	# remote_file_path = "/SPMAX-M2-02/ktran/HTP-Pre/cellulase dispensing/cell_disp_60uL_4_25_13_kt.xlsx"
	# local_file_path = "output/blah.xlsx"
	# smb.retrieve_file(volume, remote_file_path, local_file_path)



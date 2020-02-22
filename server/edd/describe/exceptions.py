class DescriptionError(Exception):
    def __init__(self, message=None, response_dict=None):
        if message is None:
            message = ""
        super().__init__(message)
        self.response_dict = response_dict

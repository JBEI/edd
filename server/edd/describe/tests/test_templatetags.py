import re

from django.template import Context, Template

from edd import TestCase


class DescribeTagTests(TestCase):
    def build_preview_image_test_template(self):
        # boilerplate for following self.test_describe_image_preview_* tests
        template = Template(r"{% load describe %}{% describe_preview_img %}")
        context = Context()
        return template.render(context)

    def build_example_file_test_template(self):
        # boilerplate for following self.test_describe_example_file_* tests
        template = Template(r"{% load describe %}{% describe_example_file %}")
        context = Context()
        return template.render(context)

    def test_describe_example_file_default(self):
        # verify that no DescribeExampleSet still renders a valid image preview by default
        with self.settings(SITE_ID=9000):
            result = self.build_example_file_test_template()
            self.assertTrue(
                re.match(
                    r"/static/main/example/sample_experiment_description.*\.xlsx",
                    result,
                )
            )

    def test_describe_image_preview_default(self):
        # verify that no DescribeExampleSet still renders a valid image preview by default
        with self.settings(SITE_ID=9000):
            result = self.build_preview_image_test_template()
            self.assertTrue(
                re.match(r"/static/main/images/describe-example.*\.png", result)
            )

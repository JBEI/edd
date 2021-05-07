from uuid import uuid4

from django.core import mail

from edd import TestCase
from edd.profile.factory import UserFactory
from main.tests import factory

from .. import exceptions, reporting, tasks
from ..broker import DescribeErrorReport


class EmailTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.user = UserFactory()
        cls.study = factory.StudyFactory()

    def test_send_describe_success_email(self):
        # send the related success email (no warnings)
        created = 42
        tasks.send_describe_success_email(
            request=uuid4(),
            user_pk=self.user.pk,
            study_uuid=self.study.uuid,
            lines_created=created,
            duration="a New York minute",
        )

        # test that the email was sent
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to
        assert str(created) in sent_email.body

    def test_send_describe_success_email_with_warnings(self):
        created = 42
        uuid = str(uuid4())

        # simulate a parser warning
        with reporting.tracker(uuid):
            reporting.warnings(uuid, exceptions.ReportableDescribeWarning())
            report = DescribeErrorReport(uuid)
            report.stash_errors()

        # send the success email, which should include the warning
        tasks.send_describe_success_email(
            request=uuid,
            user_pk=self.user.pk,
            study_uuid=self.study.uuid,
            lines_created=created,
            duration="a New York minute",
        )

        # test that the email was sent
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to
        assert str(created) in sent_email.body
        assert "warning" in sent_email.body

    def test_send_import_failure_email(self):
        tasks.send_describe_failed_email_user(
            request=uuid4(),
            study_uuid=self.study.uuid,
            user_pk=self.user.pk,
            duration="a New York minute",
            message="Whoopsie",
        )
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to

    def test_send_describe_failed_email_admin(self):
        tasks.send_describe_failed_email_admin(
            request=uuid4(),
            study_uuid=self.study.uuid,
            user_pk=self.user.pk,
            duration="a New York minute",
        )
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email not in sent_email.to
        assert self.user.email not in sent_email.cc
        assert self.user.email not in sent_email.bcc

    def test_describe_failed_email(self):
        tasks.send_describe_failed_email_user(
            uuid4(), self.user.pk, self.study.uuid, "a New York minute"
        )
        assert len(mail.outbox) == 1
        sent_email = mail.outbox[0]
        assert self.user.email in sent_email.to

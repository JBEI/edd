from django.contrib.auth.decorators import login_required
from django.urls import include, path

from . import views

app_name = "main"


# These are the URL endpoints nested under a link to a specific Study, for use with include() in
#   the two URL paths for study below. Because this list is included twice, there should be no
#   URL with the name kwarg here, as that will result in conflicts looking up URLs by name.
study_url_patterns = [
    path(
        "",
        login_required(views.StudyDetailView.as_view()),
        name="detail",
    ),
    path(
        "overview/",
        login_required(views.StudyOverviewView.as_view()),
        name="overview",
    ),
    path(
        "description/",
        login_required(views.StudyDescriptionView.as_view()),
        name="lines",
    ),
    path(
        "describe/",
        include("edd.describe.urls", namespace="describe"),
    ),
    path(
        "load/",
        include("edd.load.urls", namespace="load"),
    ),
    # kept verbose name of description for link backward-compatibility
    # no longer generating URLs like this, so no `name` kwarg
    path(
        "experiment-description/",
        login_required(views.StudyDescriptionView.as_view()),
    ),
    # deprecating these *data/ URLs in favor of access/ and REST API links
    path(
        "edddata/",
        login_required(views.study_edddata),
        name="edddata",
    ),
    # end deprecated section, access/ definition here
    path(
        "access/",
        login_required(views.study_access),
        name="access",
    ),
    path(
        "files/<int:file_id>/",
        include(
            [
                # require the ID in URL
                path(
                    "",
                    login_required(views.StudyAttachmentView.as_view()),
                    name="attachment_list",
                ),
                # optional to include file name in URL; reverse() should include it
                path(
                    "<path:file_name>/",
                    login_required(views.StudyAttachmentView.as_view()),
                    name="attachment",
                ),
            ]
        ),
    ),
    path(
        "edit/",
        login_required(views.ModifyStudyView.as_view()),
        name="modify_study",
    ),
    path(
        "edit-ajax/",
        login_required(views.ModifyStudyView.as_view(inline=True)),
        name="modify_study_ajax",
    ),
    path(
        "delete/",
        login_required(views.DeleteStudyView.as_view()),
        name="delete_study",
    ),
    path(
        "restore/",
        login_required(views.RestoreStudyView.as_view()),
        name="restore_study",
    ),
    path(
        "permission/",
        login_required(views.ModifyPermissionView.as_view()),
        name="permission",
    ),
    path(
        "permission-ajax/",
        login_required(views.ModifyPermissionView.as_view(inline=True)),
        name="permission_ajax",
    ),
    path(
        "attach/",
        login_required(views.CreateAttachmentView.as_view()),
        name="attach",
    ),
    path(
        "attach-ajax/",
        login_required(views.CreateAttachmentView.as_view(inline=True)),
        name="attach_ajax",
    ),
    path(
        "comment/",
        login_required(views.CreateCommentView.as_view()),
        name="comment",
    ),
    path(
        "comment-ajax/",
        login_required(views.CreateCommentView.as_view(inline=True)),
        name="comment_ajax",
    ),
    path(
        "new-line/",
        login_required(views.CreateLineView.as_view()),
        name="new_line",
    ),
    path(
        "new-line-ajax/",
        login_required(views.CreateLineView.as_view(inline=True)),
        name="new_line_ajax",
    ),
    path(
        "line/",
        login_required(views.InitialModifyLineView.as_view()),
        name="line_start",
    ),
    path(
        "save-line/",
        login_required(views.ModifyLineView.as_view()),
        name="line_edit",
    ),
    path(
        "save-line-ajax/",
        login_required(views.ModifyLineView.as_view(inline=True)),
        name="line_edit_ajax",
    ),
    path(
        "assay/",
        login_required(views.InitialAddAssayView.as_view()),
        name="assay_start",
    ),
    path(
        "save-assay/",
        login_required(views.AddAssayView.as_view()),
        name="assay_add",
    ),
    path(
        "save-assay-ajax/",
        login_required(views.AddAssayView.as_view(inline=True)),
        name="assay_add_ajax",
    ),
    path(
        "clone/",
        login_required(views.CloneLineView.as_view()),
        name="line_clone",
    ),
    path(
        "group/",
        login_required(views.GroupLineView.as_view()),
        name="line_group",
    ),
    path(
        "ungroup/",
        login_required(views.GroupLineView.as_view(ungroup=True)),
        name="line_ungroup",
    ),
    path(
        "line-delete/",
        login_required(views.RemoveLineView.as_view()),
        name="line_delete",
    ),
    path(
        "line-restore/",
        login_required(views.RemoveLineView.as_view(restore=True)),
        name="line_restore",
    ),
    # DEPRECATED
    path(
        "description-old/",
        login_required(views.StudyLinesView.as_view()),
        name="lines_old",
    ),
]

urlpatterns = [
    # "homepage" URLs
    path(
        "",
        login_required(views.StudyIndexView.as_view()),
        name="index",
    ),
    path(
        "study/",
        login_required(views.StudyCreateView.as_view()),
        name="create_study",
    ),
    # Individual study-specific pages loaded by primary key
    # reverse('main:edd-pk:overview', kwargs={'pk': pk})
    path(
        "study/<int:pk>/",
        include((study_url_patterns, "edd-pk")),
    ),
    # Individual study-specific pages loaded by slug
    # reverse('main:overview', kwargs={'slug': slug})
    path(
        "s/<slug:slug>/",
        include(study_url_patterns),
    ),
    # inline updates of forms editing metadata
    path(
        "meta/",
        login_required(views.InlineMetadataPartialView.as_view()),
        name="metadata_ajax",
    ),
]

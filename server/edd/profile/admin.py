import itertools
import logging

from django.contrib import admin, messages
from django.contrib.auth import get_user_model, hashers
from django.contrib.auth.admin import UserAdmin
from django.shortcuts import render
from django.utils.translation import gettext_lazy as _
from django_auth_ldap.backend import LDAPBackend

from edd.search.registry import StrainRegistry
from edd.search.solr import UserSearch

from .models import Institution, InstitutionID, UserProfile

logger = logging.getLogger(__name__)


class InstitutionInline(admin.TabularInline):
    model = InstitutionID
    extra = 1


class UserProfileAdmin(admin.ModelAdmin):
    actions = ["disable_account_action", "enable_account_action"]
    fields = ("user", "approved", "initials", "description", "preferences")
    inlines = (InstitutionInline,)
    list_display = ("user", "approved", "initials")

    def disable_account_action(self, request, queryset):
        queryset.update(approved=False)

    disable_account_action.short_description = _("Disable selected accounts")

    def enable_account_action(self, request, queryset):
        queryset.update(approved=True)

    enable_account_action.short_description = _("Enable selected accounts")

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return self.readonly_fields + ("user",)
        return self.readonly_fields


class InstitutionAdmin(admin.ModelAdmin):
    pass


class UserHasLocalLoginFilter(admin.SimpleListFilter):

    title = _("Has Local Login")
    parameter_name = "localauth"

    def lookups(self, request, model_admin):
        return (("T", _("Has Local")),)

    def queryset(self, request, queryset):
        # ignoring the system user and inactive accounts
        active = queryset.exclude(username="system").exclude(is_active=False)
        if self.value() == "T":
            return active.exclude(password__startswith="!")
        return queryset


class EDDUserAdmin(UserAdmin):
    """ Definition for admin-edit of user accounts """

    # actions is a list
    actions = UserAdmin.actions + [
        "solr_index",
        "update_groups_from_ldap",
        "search_ice_as_action",
        "deactivate_user_action",
        "migrate_local_to_ldap",
    ]
    # list_display is a tuple
    list_display = UserAdmin.list_display + ("date_joined", "last_login")
    list_filter = UserAdmin.list_filter + (UserHasLocalLoginFilter,)

    def solr_index(self, request, queryset):
        solr = UserSearch()
        # optimize queryset to fetch profile with JOIN, and single
        # queries for group/institutions instead of one per record
        q = queryset.select_related("userprofile")
        q = q.prefetch_related("groups", "userprofile__institutions")
        solr.update(q)

    solr_index.short_description = _("Index in Solr")

    def update_groups_from_ldap(self, request, queryset):
        backend = LDAPBackend()
        for user in queryset:
            ldap_user = backend.get_user(user.pk)
            try:
                ldap_user.ldap_user._mirror_groups()
            except Exception:
                # _mirror_groups fails when ldap_user is not Active, so delete all groups
                user.groups.clear()

    update_groups_from_ldap.short_description = _("Update Groups from LDAP")

    def search_ice_as_action(self, request, queryset):
        # intentionally throw error when multiple users selected
        user = queryset.get()
        context = self.admin_site.each_context(request)
        term = request.POST.get("term", "")
        registry = StrainRegistry()
        with registry.login(user):
            try:
                results = registry.search(term)
                context.update(
                    ice=registry.base_url,
                    results=list(itertools.islice(results, 20)),
                    impersonate=user,
                )
            except Exception:
                self.message_user(
                    request,
                    _("Failed to execute search in ICE, check the ICE logs."),
                    messages.ERROR,
                )
        return render(request, "admin/strain_impersonate_search.html", context=context)

    search_ice_as_action.short_description = _("Search ICE as User")

    def deactivate_user_action(self, request, queryset):
        try:
            count = queryset.update(is_active=False)
            self.message_user(
                request,
                _("Deactivated {count} users").format(count=count),
                messages.SUCCESS,
            )
        except Exception as e:
            logger.exception(f"User deactivation failed {e}")
            self.message_user(
                request,
                _("Failed to deactivate users, check the EDD logs"),
                messages.ERROR,
            )

    deactivate_user_action.short_description = _("Deactivate Users")

    def migrate_local_to_ldap(self, request, queryset):
        backend = LDAPBackend()
        for user in queryset:
            # annotate with ldap_user
            user = backend.get_user(user.pk)
            try:
                if user.ldap_user.dn is not None:
                    # replace local password with an invalid one
                    user.password = hashers.make_password(None)
                    user.save(update_fields=["password"])
                    # populate local record with LDAP values
                    user.ldap_user.populate_user()
                else:
                    self.message_user(
                        request,
                        _("Did not find matching LDAP record for {user}").format(
                            user=user.username
                        ),
                        messages.WARNING,
                    )
            except Exception as e:
                logger.exception(f"User migration to LDAP account failed {e}")
                self.message_user(
                    request,
                    _("Failed to migrate {user}").format(user=user.username),
                    messages.ERROR,
                )

    migrate_local_to_ldap.short_description = _("Migrate account to LDAP")


admin.site.register(UserProfile, UserProfileAdmin)
admin.site.register(Institution, InstitutionAdmin)
admin.site.register(get_user_model(), EDDUserAdmin)

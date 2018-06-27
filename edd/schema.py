# -*- coding: utf-8 -*-

from graphene import ObjectType, relay, Schema

from main import schema as main


class Query(main.Query, ObjectType):
    """ Main Query class that inherits from Query classes of all other Django apps. """
    node = relay.Node.Field()


schema = Schema(query=Query)

'use strict';

const { pick, uniq, prop, getOr, flatten, pipe } = require('lodash/fp');
const { getService } = require('../utils');
const { validateGetNonLocalizedAttributesInput } = require('../validation/content-types');

const getLocalesProperty = getOr([], 'properties.locales');
const getFieldsProperty = prop('properties.fields');

module.exports = {
  async getNonLocalizedAttributes(ctx) {
    const { user } = ctx.state;
    const { model, id, locale } = ctx.request.body;

    try {
      await validateGetNonLocalizedAttributesInput({ model, id, locale });
    } catch (err) {
      return ctx.badRequest('ValidationError', err);
    }

    const modelDef = strapi.getModel(model);
    const { copyNonLocalizedAttributes, isLocalized } = getService('content-types');
    const { READ_ACTION, CREATE_ACTION } = strapi.admin.services.constants;

    if (!isLocalized(modelDef)) {
      return ctx.badRequest('model.not.localized');
    }

    let params = modelDef.kind === 'singleType' ? {} : { id };

    const entity = await strapi.entityService.findOne({ params }, { model });

    if (!entity) {
      return ctx.notFound();
    }

    const permissions = await strapi.admin.services.permission.find({
      action_in: [READ_ACTION, CREATE_ACTION],
      subject: model,
      role_in: user.roles.map(prop('id')),
    });

    const localePermissions = permissions
      .filter(perm => getLocalesProperty(perm).includes(locale))
      .map(getFieldsProperty);
    const permittedFields = pipe(flatten, uniq)(localePermissions);

    const nonLocalizedFields = copyNonLocalizedAttributes(modelDef, entity);
    const sanitizedNonLocalizedFields = pick(permittedFields, nonLocalizedFields);

    ctx.body = {
      nonLocalizedFields: sanitizedNonLocalizedFields,
      localizations: entity.localizations.concat(pick(['id', 'locale'], entity)),
    };
  },
};
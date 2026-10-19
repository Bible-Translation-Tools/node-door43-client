'use strict';

var __sourceLanguageMarker = 0;
var __targetLanguageMarker = 0;
var __projectMarker = 0;
var __versificationMarker = 0;
var __chunkMarker = 0;
var __catalogMarker = 0;
var __questionnaireMarker = 0;
var __questionMarker = 0;
var __resourceMarker = 0;
var __tempTargetLanguageMarker = 0;

var responses = [];

var library = {
    set __queueResponse (data) {
        responses.push(data);
    },

    autosave: jest.fn(function(autosave) {

    }),
    commit: jest.fn(function() {

    }),
    addSourceLanguage: jest.fn(function(language) {
        __sourceLanguageMarker ++;
        return __sourceLanguageMarker;
    }),
    addTargetLanguage: jest.fn(function(language) {
        __targetLanguageMarker ++;
        return __targetLanguageMarker;
    }),
    addTempTargetLanguage: jest.fn(function(language) {
       __tempTargetLanguageMarker ++;
       return __tempTargetLanguageMarker;
    }),
    isTempTargetLanguage: jest.fn(function(slug) {
        return false;
    }),
    setApprovedTargetLanguage: jest.fn(function(temp_target_language_slug, target_language_slug) {
        return true;
    }),
    addProject: jest.fn(function(project, source_language_id) {
        __projectMarker ++;
        return __projectMarker;
    }),
    addVersification: jest.fn(function(versification, source_language_id) {
        __versificationMarker ++;
        return __versificationMarker;
    }),
    addChunkMarker: jest.fn(function(chunk, project_slug, versification_id) {
        __chunkMarker ++;
        return __chunkMarker;
    }),
    addCatalog: jest.fn(function(catalog) {
        __catalogMarker ++;
        return __catalogMarker;
    }),
    addQuestionnaire: jest.fn(function(catalog) {
        __questionnaireMarker ++;
        return __questionnaireMarker;
    }),
    addQuestion: jest.fn(function(catalog) {
        __questionMarker ++;
        return __questionMarker;
    }),
    clearTargetLanguages: jest.fn(function() {

    }),
    clearNewLanguageQuestions: jest.fn(function() {

    }),
    clearApprovedTempLanguages: jest.fn(function() {

    }),
    addResource: jest.fn(function(resource, project_id) {
        __resourceMarker ++;
        return __resourceMarker;
    }),
    listSourceLanguagesLastModified: jest.fn(function() {
        return responses.shift();
    }),
    listProjectsLastModified: jest.fn(function() {
        return responses.shift();
    }),
    getProjectMeta: jest.fn(function() {
        return responses.shift();
    }),
    public_getters: {
        getCategory: jest.fn(function(langaugeSlug, categorySlug) {
            return responses.shift();
        }),
        getCategories: jest.fn(function(languageSlug, projectSlug) {
            return responses.shift();
        }),
        getSourceLanguage: jest.fn(function(slug) {
            return responses.shift();
        }),
        getSourceLanguages: jest.fn(function() {
            return responses.shift();
        }),
        getTargetLanguage: jest.fn(function(slug) {
            return responses.shift();
        }),
        getTargetLanguages: jest.fn(function() {
            return responses.shift();
        }),
        getProject: jest.fn(function(languageSlug, projectSlug) {
            return responses.shift();
        }),
        getProjects: jest.fn(function(languageSlug) {
            return responses.shift();
        }),
        getResource: jest.fn(function(languageSlug, projectSlug, resourceSlug) {
            return responses.shift();
        }),
        getResources: jest.fn(function(languageSlug, projectSlug) {
            return responses.shift();
        }),
        getCatalog: jest.fn(function(slug) {
            return responses.shift();
        }),
        getCatalogs: jest.fn(function() {
            return responses.shift();
        }),
        getVersification: jest.fn(function() {
            return responses.shift();
        })
    }
};

module.exports = function(sqliteHelper) {
    return library;
};
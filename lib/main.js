'use strict';

const request = require('./request'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    _ = require('lodash'),
    promiseUtils = require('./utils/promises'),
    fileUtils = require('./utils/files'),
    fs = require('fs'),
    SqliteHelper = require('./sqlite-helper'),
    rimraf = require('rimraf'),
    Library = require('./library'),
    mv = require('mv'),
    rc = require('resource-container'),
    padSlug = require('./utils/slug').pad,
    ncp = require('ncp').ncp;

/**
 * Initializes a new api client.
 *
 * @param dbPath {string} the path to the db where information will be indexed.
 * @param resourceDir {string} the directory where resources will be stored
 * @param opts {{}} advanced options. compression_method: the type of compression to use for resource containers [tar|zip].
 * @returns {Client}
 * @constructor
 */
function Client(dbPath, resourceDir, opts) {
    // in case we need the client but don't want to build a resource dir.
    if(resourceDir) mkdirp.sync(resourceDir);
    opts = opts || {compression_method: 'tar'};

    const schemaPath = path.normalize(path.join(__dirname, './schema.sqlite'));
    const helper = new SqliteHelper(schemaPath, dbPath);
    const library = new Library(helper);

    /**
     * Provides read only access to the index via synchronous methods
     *
     * @type {{}}
     */
    let indexSync = library.public_getters;

    /**
     * Provides read only access to the index
     *
     * @type {{}}
     */
    let index = {};
    for(let method in library.public_getters) {
        if(library.public_getters.hasOwnProperty(method)) {
            index[method] = promiseUtils.promisify(library.public_getters[method]);
        }
    }

    /**
     * Downloads the chunks for a project
     * @param project {{}}
     */
    const downloadChunks = function(project) {
        if(project.slug.toLowerCase() === 'obs'
            || project.slug.toLowerCase() === 'bible-obs'
            || project.slug.toLowerCase() === 'bible'
            || !project.chunks_url) return Promise.resolve();


        return request.read(project.chunks_url)
            .then(function(response) {
                // consume chunk data
                if(response.status !== 200) return Promise.reject(response);

                let data;
                try {
                    data = JSON.parse(response.data);
                } catch(err) {
                    console.log(project);
                    return Promise.reject(err);
                }

                try {
                    let language_id = library.addSourceLanguage({
                        slug: 'en',
                        name: 'English',
                        direction: 'ltr'
                    });

                    // TODO: retrieve the correct versification name(s) from the source language
                    let versification_id = library.addVersification({
                        slug: 'en-US',
                        name: 'American English'
                    }, language_id);


                    if (versification_id > 0) {
                        for (let chunk of data) {
                            library.addChunkMarker({
                                chapter: padSlug(chunk.chp, 2),
                                verse: padSlug(chunk.firstvs, 2)
                            }, project.slug, versification_id);
                        }
                    }
                } catch (err) {
                    return Promise.reject(err);
                }
            });
    };

    /**
     * Downloads the source languages for a project
     * @param project {{}}
     * @returns {Promise}
     */
    const downloadSourceLanguages = function(project) {
        return request.read(project.lang_catalog)
            .then(function(response) {
                // consume language data
                if(response.status !== 200) return Promise.reject(response);

                let data;
                try {
                    data = JSON.parse(response.data);
                } catch(err) {
                    return Promise.reject(err);
                }

                let projects = [];
                for(let language of data) {
                    try {
                        let language_id = library.addSourceLanguage({
                            slug: language.language.slug,
                            name: language.language.name,
                            direction: language.language.direction
                        });

                        project.categories = _.map(project.meta, function (names, slug, index) {
                            return {name: names[index], slug: slug};
                        }.bind(this, language.project.meta));

                        if (project.slug.toLowerCase() !== 'obs') {
                            project.chunks_url = 'https://api.unfoldingword.org/bible/txt/1/' + project.slug + '/chunks.json';
                        }

                        let projectId = library.addProject({
                            slug: project.slug,
                            name: language.project.name,
                            desc: language.project.desc,
                            icon: project.icon,
                            sort: project.sort,
                            chunks_url: project.chunks_url,
                            categories: project.categories,
                        }, language_id);

                        projects.push({
                            id: projectId,
                            chunks_url: project.chunks_url,
                            slug: project.slug,
                            resourceUrl: language.res_catalog,
                            source_language_slug: language.language.slug,
                            source_language_id: language_id
                        });
                    } catch (err) {
                        return Promise.reject(err);
                    }
                }

                // TRICKY: we just flipped the data hierarchy from project->lang to lang->project for future compatibility
                return projects;
            });
    };

    /**
     * Downloads the resources for a source language.
     *
     * @param project {{}}
     * @returns {Promise}
     */
    const downloadSourceResources = function(project) {
        return request.read(project.resourceUrl)
            .then(function(response) {
                // consume resource data
                if(response.status !== 200) return Promise.reject(response);

                let data;
                try {
                    data = JSON.parse(response.data);
                } catch(err) {
                    return Promise.reject(err);
                }

                for(let resource of data) {
                    try {
                        resource.slug = resource.slug.toLowerCase();
                        switch (resource.slug) {
                            case 'obs':
                            case 'ulb':
                                resource.status.translate_mode = 'all';
                                break;
                            default:
                                resource.status.translate_mode = 'gl';
                        }

                        resource.status.pub_date = resource.status.publish_date;
                        resource.translation_words_assignments_url = resource.tw_cat;
                        resource.type = 'book';
                        resource.formats = [{
                            package_version: rc.tools.spec.version,
                            mime_type: rc.tools.typeToMime('book'),
                            modified_at: resource.date_modified,
                            imported: 0,
                            url: resource.source
                        }];
                        library.addResource(resource, project.id);

                        // coerce notes to resource
                        let helpResource = {
                            slug: 'tn',
                            name: 'translationNotes',
                            type: 'help',
                            status: resource.status,
                            formats: [{
                                package_version: rc.tools.spec.version,
                                mime_type: rc.tools.typeToMime('help'),
                                modified_at: resource.date_modified,
                                imported: 0,
                                url: resource.notes
                            }]
                        };
                        helpResource.status.translate_mode = 'gl';
                        helpResource.status.source_translations = [{
                            language_slug: project.source_language_slug,
                            resource_slug: 'tn',
                            version: resource.status.version
                        }];
                        if (resource.notes) {
                            library.addResource(helpResource, project.id);
                        }

                        // coerce questions to resource
                        helpResource.slug = 'tq';
                        helpResource.name = 'translationQuestions';
                        helpResource.formats = [{
                            package_version: rc.tools.spec.version,
                            mime_type: rc.tools.typeToMime('help'),
                            modified_at: resource.date_modified,
                            imported: 0,
                            url: resource.checking_questions
                        }];
                        helpResource.status.source_translations = [{
                            language_slug: project.source_language_slug,
                            resource_slug: 'tq',
                            version: resource.status.version
                        }];
                        if (resource.checking_questions) {
                            library.addResource(helpResource, project.id);
                        }

                        // add words project (this is insert/update so it will only be added once)
                        // TRICKY: obs tw has not been unified with bible tw yet so we add it as separate project.
                        let wordsProjectId = library.addProject({
                            slug: project.slug === 'obs' ? 'bible-obs' : 'bible',
                            name: 'translationWords' + (project.slug === 'obs' ? ' OBS' : ''),
                            desc: '',
                            icon: '',
                            sort: 100,
                            chunks_url: '',
                            categories: []
                        }, project.source_language_id);

                        // add resource to words project
                        let dictResource = _.clone(helpResource);
                        dictResource.slug = 'tw';
                        dictResource.name = 'translationWords';
                        dictResource.type = 'dict';
                        dictResource.formats = [{
                            package_version: rc.tools.spec.version,
                            mime_type: rc.tools.typeToMime('dict'),
                            modified_at: resource.date_modified,
                            imported: 0,
                            url: resource.terms
                        }];
                        dictResource.status.source_translations = [{
                            language_slug: project.source_language_slug,
                            resource_slug: 'tw',
                            version: resource.status.version
                        }];
                        if (resource.terms) {
                            library.addResource(dictResource, wordsProjectId);
                        }
                    } catch (err) {
                        return Promise.reject(err);
                    }
                }
            });
    };

    /**
     * Injects the global catalogs since they are missing from api v2.
     *
     * @returns {Promise}
     */
    const injectGlobalCatalogs = function() {
        library.addCatalog({
            slug: 'langnames',
            url: 'https://langnames-temp.walink.org/langnames.json',
            modified_at: 0
        });
        library.addCatalog({
            slug: 'new-language-questions',
            url: 'https://td.unfoldingword.org/api/questionnaire/',
            modified_at: 0
        });
        library.addCatalog({
            slug: 'temp-langnames',
            url: 'https://td.unfoldingword.org/api/templanguages/',
            modified_at: 0
        });
        // TRICKY: this catalog should always be indexed after langnames and temp-langnames otherwise the linking will fail!
        library.addCatalog({
            slug: 'approved-temp-langnames',
            url: 'https://td.unfoldingword.org/api/templanguages/assignment/changed/',
            modified_at: 0
        });
        return Promise.resolve();
    };

    /**
     * Updates all of the source content.
     * This includes languages, projects, resources, ta
     *
     * @param url
     * @param onProgress
     */
    const updateSources = function(url, onProgress) {
        return updateResources(url, onProgress)
            .then(function() {
                return updateTA(onProgress);
            });
    };

    /**
     * Indexes the languages, projects, and resources from the api
     *
     * @param url {string} the entry resource api catalog
     * @param onProgress {function} an optional progress listener. This should receive progress id, total, completed
     * @returns {Promise}
     */
    const updateResources = function(url, onProgress) {
        onProgress = onProgress || function(){};
        return injectGlobalCatalogs()
            .then(function() {
                library.commit();
               return request.read(url);
            })
            .then(function(response) {
                // disable saves for better performance
                library.autosave(false);
                // index projects and source languages
                if (response.status !== 200) return Promise.reject(response);

                let projects;
                try {
                    projects = JSON.parse(response.data);
                } catch (err) {
                    return Promise.reject(err);
                }

                return promiseUtils.chain(downloadSourceLanguages, function(err, data) {
                    if(err instanceof Error) return Promise.reject(err);
                    console.log(err);
                    return false;
                }, {compact: true, onProgress: onProgress.bind(null, 'projects')})(projects);
            })
            .then(function(projects) {
                // index resources
                library.commit();
                if(!projects) return Promise.reject('No projects found');
                let list = [];
                for(let project of projects) {
                    for(let localizedProject of project) {
                        list.push({
                            id: localizedProject.id,
                            slug: localizedProject.slug,
                            source_language_id: localizedProject.source_language_id,
                            resourceUrl: localizedProject.resourceUrl
                        });
                    }
                }

                return promiseUtils.chain(downloadSourceResources, function(err, data) {
                    if(err instanceof Error) return Promise.reject(err);
                    console.log(err);
                    return false;
                }, {compact: true, onProgress: onProgress.bind(null, 'resources')})(list);
            }).then(function() {
                // keep the promise args clean
                library.commit();
                library.autosave(true);
                return Promise.resolve();
            }).catch(function(err) {
                library.autosave(true);
                return Promise.reject(err);
            });
    };

    /**
     * Downloads the chunks for all projects
     * @param onProgress
     * @returns {Promise.<>}
     */
    const updateChunks = function(onProgress) {
        onProgress = onProgress || function() {};
        let projects = library.public_getters.getProjects();
        library.autosave(false);
        return promiseUtils.chain(downloadChunks, function(err, data) {
            if(err instanceof Error) return Promise.reject(err);
            console.log(err);
            return false;
        }, {compact: true, onProgress: onProgress.bind(null, 'chunks')})(projects)
            .then(function() {
                library.commit();
                library.autosave(true);
                return Promise.resolve();
            })
            .catch(function(err) {
                library.autosave(true);
                return Promise.reject(err);
            });
    };

    /**
     * Downloads the tA projects
     * @param onProgress
     * @returns {Promise.<>}
     */
    const updateTA = function(onProgress) {
        onProgress = onProgress || function() {};
        library.autosave(false);
        let modules_urls = [
            'https://api.unfoldingword.org/ta/txt/1/en/audio_2.json',
            'https://api.unfoldingword.org/ta/txt/1/en/checking_1.json',
            'https://api.unfoldingword.org/ta/txt/1/en/checking_2.json',
            'https://api.unfoldingword.org/ta/txt/1/en/gateway_3.json',
            'https://api.unfoldingword.org/ta/txt/1/en/intro_1.json',
            'https://api.unfoldingword.org/ta/txt/1/en/process_1.json',
            'https://api.unfoldingword.org/ta/txt/1/en/translate_1.json',
            'https://api.unfoldingword.org/ta/txt/1/en/translate_2.json'
        ];
        return promiseUtils.chain(downloadTA, function(err, data) {
            if(err instanceof Error) return Promise.reject(err);
            console.log(err);
            return false;
        }, {compact: true, onProgress: onProgress.bind(null, 'ta')})(modules_urls)
            .then(function() {
                library.commit();
                library.autosave(true);
                return Promise.resolve();
            })
            .catch(function(err) {
                library.autosave(true);
                return Promise.reject(err);
            });
    };

    const downloadTA = function(url) {
        return request.read(url)
            .then(function(response) {
                if(response.status !== 200) return Promise.reject(response);

                try {
                    // add language (right now only english)
                    let languageId = library.addSourceLanguage({
                        slug: 'en',
                        name: 'English',
                        direction: 'ltr'
                    });

                    let data;
                    try {
                        data = JSON.parse(response.data);
                    } catch (err) {
                        return Promise.reject(err);
                    }

                    // add project
                    let projectId = library.addProject({
                        slug: 'ta-' + data.meta.manual.replace(/\_/g, '-'),
                        name: data.meta.manual.charAt(0).toUpperCase() + data.meta.manual.slice(1) + ' Manual',
                        desc: '',
                        icon: '',
                        sort: 0,
                        chunks_url: '',
                        categories: [{slug: 'ta', name: 'translationAcademy'}]
                    }, languageId);

                    // add resource
                    let resource = {
                        slug: 'vol' + data.meta.volume,
                        name: 'Volume ' + data.meta.volume,
                        type: 'man',
                        status: data.meta.status,
                        formats: [{
                            package_version: rc.tools.spec.version,
                            mime_type: rc.tools.typeToMime('man'),
                            modified_at: data.meta.mod,
                            imported: 0,
                            url: url
                        }]
                    };
                    resource.status.translate_mode = 'gl';
                    library.addResource(resource, projectId);
                } catch (err) {
                    return Promise.reject(err);
                }
            });
    };

    /**
     * Updates all of the global catalogs
     * @param onProgress
     * @returns {Promise.<>}
     */
    const updateCatalogs = function(onProgress) {
        const errorHandler = function(err) {
            if(err instanceof Error) {
                return Promise.reject(err);
            } else {
                return Promise.resolve();
            }
        };

        // TRICKY: the language catalogs are dependent so we must run them in order
        return updateCatalog('langnames', onProgress)
            .catch(errorHandler)
            .then(function(response) {
                return updateCatalog('temp-langnames', onProgress);
            })
            .catch(errorHandler)
            .then(function(response) {
                return updateCatalog('approved-temp-langnames', onProgress);
            })
            .catch(errorHandler)
            .then(function(response) {
                return updateCatalog('new-language-questions', onProgress)
            })
            .catch(errorHandler)
            .then(function() {
                return Promise.resolve();
            });
    };

    /**
     * Downloads a global catalog and indexes it.
     * Note: you may provide a single object parameter if you prefer.
     *
     * @param slug {string|{}} the slug of the catalog to download. Or an object containing all the args.
     * @param onProgress {function} an optional progress listener. This should receive progress id, total, completed
     * @returns {Promise}
     */
    const updateCatalog = function(slug, onProgress) {
        // support passing args as an object
        if(slug != null && typeof slug == 'object') {
            onProgress = slug.onProgress;
            slug = slug.slug;
        }
        onProgress = onProgress || function() {};
        onProgress = onProgress.bind(null, slug);

        library.autosave(false);
        return injectGlobalCatalogs()
            .then(function() {
                return new Promise(function(resolve, reject) {
                    try {
                        resolve(library.public_getters.getCatalog(slug));
                    } catch(err) {
                        reject(err);
                    }
                })
            })
            .then(function(catalog) {
                if(!catalog) return Promise.reject(new Error('Unknown catalog'));
                return request.read(catalog.url);
            })
            .then(function(response) {
                if(response.status != 200) return Promise.reject(response);
                return response.data;
            })
            .then(function(data) {
                library.autosave(false);
                if(slug === 'langnames') {
                    library.clearTargetLanguages();
                    return indexTargetLanguageCatalog(data, onProgress);
                } else if(slug === 'new-language-questions') {
                    library.clearNewLanguageQuestions();
                    return indexNewLanguageQuestionsCatalog(data, onProgress);
                } else if(slug === 'temp-langnames') {
                    // TRICKY: we do not clear this table because users can add data to it
                    return indexTempLangsCatalog(data, onProgress);
                } else if(slug === 'approved-temp-langnames') {
                    library.clearApprovedTempLanguages();
                    return indexApprovedTempLangsCatalog(data, onProgress);
                } else {
                    return Promise.reject(new Error('Parsing this catalog has not been implemented'));
                }
            })
            .then(function(response) {
                library.commit();
                library.autosave(true);
                return Promise.resolve(response);
            })
            .catch(function(err) {
                library.autosave(true);
                return Promise.reject(err);
            });
    };

    /**
     * Parses the target language catalog and indexes it.
     *
     * @param data {string}
     * @param onProgress {function} an optional progress listener. This should receive progress id, total, completed
     * @returns {Promise}
     */
    const indexTargetLanguageCatalog = function(data, onProgress) {
        onProgress = onProgress || function() {};
        return new Promise(function(resolve, reject) {
            try {
                let languages = JSON.parse(data);
                _.forEach(languages, function (language, index) {
                    language.slug = language.lc;
                    language.name = language.ln;
                    language.anglicized_name = language.ang;
                    language.direction = language.ld;
                    language.region = language.lr;
                    language.country_codes = language.cc || [];
                    language.aliases = language.alt || [];
                    language.is_gateway_language = language.gl ? language.gl : false;

                    try {
                        library.addTargetLanguage(language);
                    } catch (err) {
                        console.error('Failed to add target language', language);
                        reject(err);
                        return;
                    }
                    onProgress(languages.length, index + 1);
                });
                resolve();
            } catch(err) {
                reject(err);
            }
        });
    };

    /**
     * Parses the new language questions catalog and indexes it.
     *
     * @param data {string}
     * @param onProgress {function} an optional progress listener. This should receive progress id, total, completed
     * @returns {Promise}
     */
    const indexNewLanguageQuestionsCatalog = function(data, onProgress) {
        onProgress = onProgress || function() {};
        return new Promise(function(resolve, reject) {
            try {
                let obj = JSON.parse(data);
                _.forEach(obj.languages, function (questionnaire, index) {
                    // format
                    questionnaire.language_slug = questionnaire.slug;
                    questionnaire.language_name = questionnaire.name;
                    questionnaire.td_id = questionnaire.questionnaire_id;
                    questionnaire.language_direction = questionnaire.dir.toLowerCase() === 'rtl' ? 'rtl' : 'ltr';

                    try {
                        let id = library.addQuestionnaire(questionnaire);
                        if (id > 0) {
                            // add questions
                            _.forEach(questionnaire.questions, function (question, n) {
                                // format question
                                question.is_required = question.required ? 1 : 0;
                                question.depends_on = question.depends_on === null ? -1 : question.depends_on;
                                question.td_id = question.id;

                                try {
                                    library.addQuestion(question, id);
                                } catch (err) {
                                    console.error('Failed to add question', question);
                                    reject(err);
                                    return;
                                }
                                // broadcast itemized progress if there is only one questionnaire
                                if (obj.languages.length == 1) {
                                    onProgress(questionnaire.questions.length, n + 1);
                                }
                            });
                        } else {
                            console.error('Failed to add questionnaire', questionnaire);
                        }
                    } catch (err) {
                        console.error('Failed to add questionnaire', questionnaire);
                        reject(err);
                        return;
                    }
                    // broadcast overall progress if there are multiple questionnaires.
                    if (obj.languages.length > 1) {
                        onProgress(obj.languages.length, index + 1);
                    }
                });
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    };

    /**
     * Parses the temporary language codes catalog and indexes it.
     *
     * @param data {string}
     * @param onProgress {function} an optional progress listener. This should receive progress id, total, completed
     * @returns {Promise}
     */
    const indexTempLangsCatalog = function(data, onProgress) {
        onProgress = onProgress || function() {};
        return new Promise(function(resolve, reject) {
            try {
                let languages = JSON.parse(data);
                _.forEach(languages, function (language, index) {
                    // format
                    language.slug = language.lc;
                    language.name = language.ln;
                    language.anglicized_name = language.ang;
                    language.direction = language.ld;
                    language.region = language.lr;
                    language.country_codes = language.cc || [];
                    language.aliases = language.alt || [];
                    language.is_gateway_language = language.gl ? language.gl : false;

                    try {
                        if(!library.addTempTargetLanguage(language)) {
                            reject('Failed to add temporary target language');
                        }
                    } catch (err) {
                        console.error('Failed to add temporary target language', language);
                        reject(err);
                        return;
                    }
                    onProgress(languages.length, index + 1);
                });
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    };

    /**
     * Parses the approved temporary language codes catalog and indexes it.
     *
     * @param data {string}
     * @param onProgress {function} an optional progress listener. This should receive progress id, total, completed
     * @returns {Promise}
     */
    const indexApprovedTempLangsCatalog = function(data, onProgress) {
        onProgress = onProgress || function() {};
        return new Promise(function(resolve, reject) {
            let languages = JSON.parse(data);
            _.forEach(languages, function(language, index) {
                try {
                    let tempCode = Object.keys(language)[0];
                    library.setApprovedTargetLanguage(tempCode, language[tempCode]);
                } catch (err) {
                    console.error('Failed to set the approved language code', language);
                    reject(err);
                    return;
                }
                onProgress(languages.length, index + 1);
            });
            resolve();
        });
    };

    /**
     * Returns the first resource container format found in the list.
     * E.g. the array may contain binary formats such as pdf, mp3, etc. This basically filters those.
     *
     * @param formats {[]} an array of resource formats
     * @returns {{}} the resource container format
     */
    const getResourceContainerFormat = function(formats) {
        for(let format of formats) {
            // TODO: rather than hard coding the mime type use library.spec.base_mime_type
            if(format.mime_type.match(/application\/tsrc\+.+/)) {
                return format;
            }
        }
        return null;
    };

    /**
     * Downloads a resource container.
     * Note: You may provide a single object parameter if you prefer
     *
     * TRICKY: to keep the interface stable we've abstracted some things.
     * once the api supports real resource containers this entire method can go away and be replace
     * with downloadContainer_Future (which should be renamed to downloadContainer).
     * convertLegacyResourceToContainer will also become deprecated at that time though it may be handy to keep around.
     *
     * @param languageSlug {string}
     * @param projectSlug {string}
     * @param resourceSlug {string}
     * @param progressCallback {function} receives download progress updates
     * @returns {Promise.<Container>} The new container
     */
    const downloadContainer = function(languageSlug, projectSlug, resourceSlug, progressCallback) {
        // support passing args as an object
        if(languageSlug != null && typeof languageSlug == 'object') {
            resourceSlug = languageSlug.resourceSlug;
            projectSlug = languageSlug.projectSlug;
            languageSlug = languageSlug.languageSlug;
        }

        // get the legacy data as if it were a real resource container
        return downloadContainer_Future(languageSlug, projectSlug, resourceSlug, progressCallback)
            .then(function(path) {
                // migrate to resource container
                let resource;
                try {
                    resource = library.public_getters.getResource(languageSlug, projectSlug, resourceSlug);
                } catch (err) {
                    return Promise.reject(err);
                }

                if(!resource) return Promise.reject(new Error('Unknown resource'));

                // remove import flag
                let containerFormat = getResourceContainerFormat(resource.formats);
                if(!containerFormat) return Promise.reject(new Error('Unknown resource format'));
                containerFormat.imported = 0;
                resource.formats = [containerFormat];

                try {
                    library.addResource(resource, resource.project_id);
                } catch (err) {
                    rimraf.sync(path);
                    return Promise.reject(err);
                }

                let data = fs.readFileSync(path, {encoding: 'utf8'});

                // clean downloaded file
                rimraf.sync(path);
                return convertLegacyResourceToContainer(languageSlug, projectSlug, resourceSlug, data);
            });
    };

    /**
     * Downloads a resource container.
     * This expects a correctly formatted resource container
     * and will download it directly to the disk
     *
     * Note: You may provide a single object parameter if you prefer
     *
     * once the api can deliver proper resource containers this method
     * should be renamed to downloadContainer
     *
     * @param languageSlug {string}
     * @param projectSlug {string}
     * @param resourceSlug {string}
     * @param progressCallback {function} receives download progress updates
     * @returns {Promise.<String>} the path to the downloaded resource container
     */
    const downloadContainer_Future = function(languageSlug, projectSlug, resourceSlug, progressCallback) {
        // support passing args as an object
        if(languageSlug != null && typeof languageSlug == 'object') {
            resourceSlug = languageSlug.resourceSlug;
            projectSlug = languageSlug.projectSlug;
            languageSlug = languageSlug.languageSlug;
        }

        let destFile;
        let tempFile;
        let containerDir;
        return new Promise(function(resolve, reject) {
                try {
                    resolve(library.public_getters.getResource(languageSlug, projectSlug, resourceSlug));
                } catch(err) {
                    reject(err);
                }
            })
            .then(function(resource) {
                if(!resource) return Promise.reject(new Error('Unknown resource'));
                let containerFormat = getResourceContainerFormat(resource.formats);
                if(!containerFormat) return Promise.reject(new Error('Missing resource container format'));
                let containerSlug = rc.tools.makeSlug(languageSlug, projectSlug, resourceSlug);
                containerDir = path.join(resourceDir, containerSlug);
                destFile = containerDir + '.' + rc.tools.spec.file_ext;
                tempFile = containerDir + '.download';

                rimraf.sync(tempFile);

                mkdirp(path.dirname(containerDir));
                if(!containerFormat.url) return Promise.reject('Missing resource format url');
                return request.download(containerFormat.url, tempFile, progressCallback);
            })
            .then(function(response) {
                if(response.status !== 200) {
                    rimraf.sync(tempFile);
                    return Promise.reject(response);
                }
                // replace old files
                rimraf.sync(containerDir);
                return new Promise(function(resolve, reject) {
                    mv(tempFile, destFile, {clobber: true}, function(err) {
                        if(err) {
                            reject(err);
                        } else {
                            resolve(destFile);
                        }
                    });
                });
            });
    };

    /**
     * Converts a legacy resource catalog into a resource container.
     * The container will be placed in.
     *
     * This will be deprecated once the api is updated to support proper resource containers.
     *
     * @param languageSlug {string}
     * @param projectSlug {string}
     * @param resourceSlug {string}
     * @param data {string} the legacy data that will be converted
     * @return {Promise.<Container>}
     */
    const convertLegacyResourceToContainer = function(languageSlug, projectSlug, resourceSlug, data) {
        let containerSlug = rc.tools.makeSlug(languageSlug, projectSlug, resourceSlug);
        let dir = path.join(resourceDir, containerSlug);

        return new Promise(function(resolve, reject) {
                let props = {};
                props.language = library.public_getters.getSourceLanguage(languageSlug);
                if(!props.language) {
                    reject(new Error('Missing language'));
                    return;
                }
                props.project = library.public_getters.getProject(languageSlug, projectSlug);
                if(!props.project) {
                    reject(new Error('Missing project'));
                    return;
                }
                props.project.categories = [];
                let categories = library.public_getters.getCategories(languageSlug, projectSlug);
                for(let cat of categories) {
                    props.project.categories.push(cat.slug);
                }

                props.resource = library.public_getters.getResource(languageSlug, projectSlug, resourceSlug);
                if(!props.resource) {
                    reject(new Error('Missing resource'));
                    return;
                }

                let format = getResourceContainerFormat(props.resource.formats);
                props.modified_at = format && format.modified_at ? format.modified_at : 0;

                delete props.language.id;
                delete props.project.id;
                delete props.project.source_language_id;
                delete props.project.source_language_slug;
                delete props.project.category_id;
                delete props.resource.id;
                delete props.resource.project_id;
                delete props.resource.source_language_slug;
                delete props.resource.project_slug;
                delete props.resource.formats;

                resolve(props);
            })
            .then(function(props) {
                // grab the tW assignments
                if(props.resource.translation_words_assignments_url) {
                    return request.read(props.resource.translation_words_assignments_url)
                        .then(function(request) {
                            if(request.status < 300) {
                                try {
                                    let tw_assignments = {};
                                    for (let chapter of JSON.parse(request.data).chapters) {
                                        chapter.id = padSlug(chapter.id);
                                        tw_assignments[chapter.id] = {};
                                        for (let frame of chapter.frames) {
                                            frame.id = padSlug(frame.id);
                                            tw_assignments[chapter.id][frame.id] = [];
                                            for (let word of frame.items) {
                                                let twProj = props.project.slug === 'obs' ? 'bible-obs' : 'bible';
                                                tw_assignments[chapter.id][frame.id].push('//' + twProj + '/tw/' + word.id);
                                            }
                                        }
                                    }
                                    props.tw_assignments = tw_assignments;
                                } catch (err) {
                                    console.warn(err);
                                }
                            }
                            delete props.resource.translation_words_assignments_url;
                            return Promise.resolve(props);
                        });
                } else {
                    return Promise.resolve(props);
                }
            })
            .then(function(props) {
                return rc.tools.convertResource(data, dir, props);
            });
    };

    /**
     * Loads a resource container from anywhere on the disk.
     * This does not look in the internal resource container directory
     * or check the index.
     *
     * @param containerPath the absolute path to a resource container directory
     * @returns {Promise.<Container>}
     */
    const loadContainer = function(containerPath) {
        return rc.load(containerPath);
    };

    /**
     * Copies a valid resource container into the resource directory and adds an entry to the index.
     * If the container already exists in the system it will be overwritten.
     * Invalid containers will cause this method to return an error.
     * The container *must* be open (uncompressed). This is in preparation for v0.2 of the rc spec.
     * Containers imported in this manner will have a flag set to indicate it was manually imported.
     *
     * @param containerPath {string} the path to the resource container directory that will be imported
     * @returns {Promise.<Container>}
     */
    const importContainer = function(containerPath) {
        return rc.load(containerPath)
            .then(function(container) {
                // validate project
                // TRICKY: we currently only support importing known projects. Only the language and resource can vary.
                let meta = library.getProjectMeta(container.project.slug);
                if(!meta) return Promise.reject(new Error('Unsupported project'));

                // delete the old container
                let destination = path.join(resourceDir, container.slug);
                rimraf.sync(destination);
                return new Promise(function(resolve, reject) {
                    ncp(containerPath, destination, function(err) {
                        if(err) {
                            reject(err);
                        } else {
                            // add entry to the index
                            try {
                                // TODO: begin transaction
                                // library.autosave(false);
                                let languageId = library.addSourceLanguage(container.language);

                                // build categories
                                try {
                                    let categories = [];
                                    if(container.info.project.categories) {
                                        for (let catSlug of container.info.project.categories) {
                                            let existingCat = library.public_getters.getCategory(container.language.slug, catSlug);
                                            let catName = existingCat ? existingCat.name : catSlug;
                                            categories.push({
                                                slug: catSlug,
                                                name: catName
                                            });
                                        }
                                    }
                                    container.project.categories = categories;
                                } catch (err) {
                                    console.log(err);
                                }

                                let projectId = library.addProject(container.project, languageId);
                                // NOTE: we should technically remove the old formats, but we only use the rc format so we can ignore the rest.
                                let resource = container.resource;
                                resource.formats = [{
                                    package_version: container.info.package_version,
                                    mime_type: container.resource.type,
                                    modified_at: container.resource.date_modified,
                                    imported: true,
                                    url: ''
                                }];
                                library.addResource(resource, projectId);
                                // library.autosave(true);
                                // TODO: commit changes
                                resolve();
                            } catch (err) {
                                // TODO: roll back changes
                                // library.autosave(true);
                                reject(err);
                            }
                        }
                    });
                }).then(function() {
                    return openContainer(container.language.slug, container.project.slug, container.resource.slug);
                });
            });
    };

    /**
     * Opens a resource container archive so it's contents can be read.
     * The index will be referenced to validate the resource and retrieve the container type.
     *
     * @param languageSlug {string}
     * @param projectSlug {string}
     * @param resourceSlug {string}
     * @returns {Promise.<Container>}
     */
    const openContainer = function(languageSlug, projectSlug, resourceSlug) {
        return new Promise(function(resolve, reject) {
                try {
                    resolve(library.public_getters.getResource(languageSlug, projectSlug, resourceSlug));
                } catch(err) {
                    reject(err);
                }
            })
            .then(function(resource) {
                if(!resource) return Promise.reject(new Error('Unknown resource'));
                let containerSlug = rc.tools.makeSlug(languageSlug, projectSlug, resourceSlug);
                let directory = path.join(resourceDir, containerSlug);
                let archive = directory + '.' + rc.tools.spec.file_ext;
                return rc.open(archive, directory, opts);
            });
    };

    /**
     * Closes a resource container archive.
     *
     * @param languageSlug {string}
     * @param projectSlug {string}
     * @param resourceSlug {string}
     * @returns {Promise.<string>} the path to the closed container
     */
    const closeContainer = function(languageSlug, projectSlug, resourceSlug) {
        return new Promise(function(resolve, reject) {
                try {
                    resolve(library.public_getters.getResource(languageSlug, projectSlug, resourceSlug));
                } catch(err) {
                    reject(err);
                }
            })
            .then(function(resource) {
                if(!resource) return Promise.reject(new Error('Unknown resource'));
                let containerSlug = rc.tools.makeSlug(languageSlug, projectSlug, resourceSlug);
                let directory = path.join(resourceDir, containerSlug);
                opts.clean = true; // remove the directory once closed.
                return rc.close(directory, opts);
            });
    };

    /**
     * Returns a list of resource containers that have been downloaded
     * @returns {Promise.<[{}]>} an array of resource container info objects (package.json).
     */
    const listResourceContainers = function() {
        return new Promise(function(resolve, reject) {
            try {
                let files;
                if(fileUtils.fileExists(resourceDir)) {
                    files = fs.readdirSync(resourceDir);
                    files = _.uniqBy(files, function (f) {
                        return path.basename(f, '.' + rc.tools.spec.file_ext);
                    }).map(function(f) { return path.join(resourceDir, f);});
                }
                if(!files) files = [];
                resolve(files);
            } catch (err) {
                reject(err);
            }
        }).then(function(files) {
            return promiseUtils.chain(rc.tools.inspect, function(err) {
                console.error(err);
                return false;
            })(files);
        });
    };

    /**
     * Prepares a list of items that are eligible for updates.
     * Note: This is different than what's available for download. Everything in the index is technically available for download.
     *
     * Eligibility is determined by:
     * * available items who's modified_at exceeds the local equivalent
     * * available items who's modified_at is 0 and accompanying local item's modified_at is 0
     *
     * @param local {{}} keyed object of local (downloaded) items.
     * @param available {[{slug, modified_at}]} an array of available (indexed) items
     * @returns {Promise.<Array>}
     */
    const inferUpdates = function(local, available) {
        let updates = [];
        for(let a of available) {
            try {
                if (a.modified_at > local[a.slug]
                    || (a.modified_at == 0 && local[a.slug] == 0)) updates.push(a.slug);
            } catch(err) {
                console.error(err);
            }
        }
        return Promise.resolve(updates);
    };

    /**
     * Returns a list of source languages that are eligible for updates.
     *
     * @returns {Promise.<Array>} An array of slugs
     */
    const listSourceLanguageUpdates = function() {
        return new Promise(function(resolve, reject) {
            try{
                resolve(library.listSourceLanguagesLastModified());
            } catch (err) {
                reject(err);
            }
        }).then(function(languages) {
            return listResourceContainers()
                .then(function(results) {
                    // flatten modified_at
                    let local = {};
                    for(let info of results) {
                        try {
                            if(!local[info.language.slug]) local[info.language.slug] = -1;
                            let old = local[info.language.slug];
                            local[info.language.slug] = info.modified_at > old ? info.modified_at : old;
                        } catch (err) {
                            console.error(err);
                        }
                    }
                    return inferUpdates(local, languages);
                });
        });
    };

    /**
     * Returns a list of projects that are eligible for updates.
     * If no language is given the results will include all projects in all languages. This is helpful if you need to view updates based on project first rather than source language first.
     *
     * @param languageSlug {string|null} the slug of a source language who's projects will be checked.
     * @returns {Promise.<Array>} An array of slugs
     */
    const listProjectUpdates = function(languageSlug) {
       return new Promise(function(resolve, reject) {
            try{
                resolve(library.listProjectsLastModified(languageSlug));
            } catch (err) {
                reject(err);
            }
        }).then(function(projects) {
            return listResourceContainers()
                .then(function(results) {
                    // flatten modified_at
                    let local = {};
                    for(let info of results) {
                        try {
                            if(languageSlug && info.language.slug !== languageSlug) continue;
                            if(!local[info.project.slug]) local[info.project.slug] = -1;
                            let old = local[info.project.slug];
                            local[info.project.slug] = info.modified_at > old ? info.modified_at : old;
                        } catch (err) {
                            console.error(err);
                        }
                    }
                    return inferUpdates(local, projects);
                });
        });
    };

    return {
        updateSources: updateSources,
        updateChunks: updateChunks,
        updateCatalogs: updateCatalogs,
        downloadResourceContainer: downloadContainer,
        legacy_tools: {
            updateResources: updateResources,
            updateTA: updateTA,
            updateCatalog: updateCatalog,

            downloadFutureCompatibleResourceContainer: downloadContainer_Future,
            convertResource: convertLegacyResourceToContainer
        },
        loadResourceContainer: loadContainer,
        importResourceContainer: importContainer,
        openResourceContainer: openContainer,
        closeResourceContainer: closeContainer,
        listResourceContainers: listResourceContainers,
        findUpdates: {
            sourceLanguages:listSourceLanguageUpdates,
            projects:listProjectUpdates
        },
        index: index,
        indexSync: indexSync
    };
}

module.exports = Client;
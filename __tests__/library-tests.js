'use strict';

jest.unmock('lodash');
jest.unmock('sql.js');
jest.unmock('../lib/library');

const config = {
    schemaPath: './lib/schema.sqlite',
    dbPath: null
};

const _ = require('lodash');

describe('Library', () => {
    var library;
    process.setMaxListeners(0);

    function setUpContext() {
        var Library = require('../lib/library');
        var realfs = require.requireActual('fs');
        var schema = realfs.readFileSync(config.schemaPath);
        var fs = require('fs');
        fs.writeFileSync(config.schemaPath, schema);
        var SqliteHelper = require('../lib/sqlite-helper');
        library = new Library(new SqliteHelper(config.schemaPath, config.dbPath));
    }

    function alter(object, alteredKeys) {
        var alternate = _.cloneDeep(object);
        _.each(alteredKeys, function(value, index) {
            alternate[value] += '-alt';
        });
        return alternate;
    }

    /**
     *
     * @param setter
     * @param getter
     * @param insertObject
     * @param setterExtraArgs
     * @param getterExtraArgs
     * @param cleanArgs
     */
    function testInsert(setter, getter, insertObject, setterExtraArgs, getterExtraArgs, cleanArgs) {
        var object = _.cloneDeep(insertObject);
        setterExtraArgs = setterExtraArgs || [];
        getterExtraArgs = getterExtraArgs || [];
        cleanArgs = cleanArgs || [];

        var fun = library[setter];
        setterExtraArgs.unshift(object);
        var id = fun.apply(null, setterExtraArgs);
        expect(id).toBeTruthy();

        getterExtraArgs.push(object.slug);
        var result = library.public_getters[getter].apply(null, getterExtraArgs);
        expect(result).not.toEqual(null);
        if(result.id) {
            expect(result.id).toEqual(id);
            delete result.id;
        }

        // clean objects before comparison
        _.each(cleanArgs, function(value, index) {
            delete result[value];
        });
        _.each(cleanArgs, function(value, index) {
            delete object[value];
        });
        expect(result).toEqual(object);
    }

    /**
     *
     * @param setter
     * @param getter
     * @param insertObject
     * @param updateObject
     * @param setterExtraArgs
     * @param getterExtraArgs
     * @param cleanArgs
     */
    function testUpdate(setter, getter, insertObject, updateObject, setterExtraArgs, getterExtraArgs, cleanArgs) {
        setterExtraArgs = setterExtraArgs || [];
        getterExtraArgs = getterExtraArgs || [];
        cleanArgs = cleanArgs || [];

        var fun = library[setter];
        setterExtraArgs.unshift(insertObject);
        var id = fun.apply(null, setterExtraArgs);
        expect(id).toBeTruthy();

        // update
        setterExtraArgs.shift();
        setterExtraArgs.unshift(updateObject);
        var updatedId = fun.apply(null, setterExtraArgs);
        expect(updatedId).toEqual(id);

        getterExtraArgs.push(insertObject.slug);
        var result = library.public_getters[getter].apply(null, getterExtraArgs);
        if(result.id) {
            expect(result.id).toEqual(id);
            delete result.id;
        }

        // clean objects before comparison
        _.each(cleanArgs, function(value, index) {
            delete result[value];
        });
        _.each(cleanArgs, function(value, index) {
            delete insertObject[value];
        });
        _.each(cleanArgs, function(value, index) {
            delete updateObject[value];
        });
        expect(result).toEqual(updateObject);
        expect(result).not.toEqual(insertObject);
        expect(result.slug).toEqual(insertObject.slug);
    }

    function testIncomplete(setter, object, setterExtraArgs) {
        setterExtraArgs = setterExtraArgs || [];

        var fun = library[setter];
        setterExtraArgs.unshift(object);
        var error = null;
        try {
            var id = fun.apply(null, setterExtraArgs);
            expect(id).not.toBeTruthy();
        } catch (e) {
            error = e;
        }
        expect(error).not.toEqual(null);
    }

    function testMissing(getter, getterArgs) {
        var result = library.public_getters[getter].apply(null, getterArgs);
        expect(result).toEqual(null);
    }

    function testMultiple(setter, getterMultiple, object, setterExtraArgs, getterArgs) {
        var objectAlt = alter(object, ['slug']);
        setterExtraArgs = setterExtraArgs || [];

        var fun = library[setter];

        // add first
        setterExtraArgs.unshift(object);
        var firstId = fun.apply(null, setterExtraArgs);
        expect(firstId > 0).toBeTruthy();

        // add second
        setterExtraArgs.shift();
        setterExtraArgs.unshift(objectAlt);
        var secondId = fun.apply(null, setterExtraArgs);
        expect(secondId).toBeTruthy();

        if(typeof secondId !== 'boolean') {
            expect(secondId).not.toEqual(firstId);
        }

        var result = library.public_getters[getterMultiple].apply(null, getterArgs);
        expect(result.length).toBeTruthy();
    }

    describe('SourceLanguage', () => {
        var language;
        var languageAlt;

        beforeEach(() => {
            setUpContext();
            language = {
                slug: 'en',
                name: 'English',
                direction: 'ltr'
            };
            languageAlt = alter(language, ['name']);
        });

        it('should add a source language to the database', () => {
            testInsert('addSourceLanguage', 'getSourceLanguage', language);
        });

        it('should update a source language in the database', () => {
            testUpdate('addSourceLanguage', 'getSourceLanguage', language, languageAlt);
        });

        it('should not add incomplete source language to the database', () => {
            delete language.name;
            testIncomplete('addSourceLanguage', language);
        });

        it('should return null for a missing source language', () => {
            testMissing('getSourceLanguage', ['missing-lang']);
        });

        it('should return multiple source languages', () => {
           testMultiple('addSourceLanguage', 'getSourceLanguages', language);
        });
    });

    describe('TargetLanguage', () => {
        var language;
        var languageAlt;

        beforeEach(() => {
            setUpContext();
            language = {
                slug: 'en',
                name: 'English',
                anglicized_name: 'English',
                direction: 'ltr',
                region: 'United States',
                is_gateway_language: 1
            };
            languageAlt = alter(language, ['name', 'anglicized_name', 'region']);
        });

        it('should add a target language to the database', () => {
            testInsert('addTargetLanguage', 'getTargetLanguage', language);
        });

        it('should update a target language in the database', () => {
            testUpdate('addTargetLanguage', 'getTargetLanguage', language, languageAlt);
        });

        it('should not add incomplete target language to the database', () => {
            delete language.name;
            testIncomplete('addTargetLanguage', language);
        });

        it('it should return null for a missing target language', () => {
            testMissing('getTargetLanguage', ['missing-lang']);
        });

        it('should return multiple target languages', () => {
            testMultiple('addTargetLanguage', 'getTargetLanguages', language);
        });
    });

    describe('Temporary TargetLanguage', () => {
        var language;
        var languageAlt;

        beforeEach(() => {
            setUpContext();
            language = {
                slug: 'en',
                name: 'English',
                anglicized_name: 'American English',
                direction: 'ltr',
                region: 'United States',
                is_gateway_language: 0
            };
            languageAlt = alter(language, ['name', 'region']);
        });

        it('should add a temporary target language to the database', () => {
            testInsert('addTempTargetLanguage', 'getTargetLanguage', language);
        });

        it('should update a temporary target language in the database', () => {
            testUpdate('addTempTargetLanguage', 'getTargetLanguage', language, languageAlt);
        });

        it('should tell temporary languages from regular ones', () => {
            library.addTempTargetLanguage(language);
            library.addTargetLanguage(alter(language, ['slug']));
            expect(library.isTempTargetLanguage(language.slug)).toEqual(true);
            expect(library.isTempTargetLanguage(language.slug + '-alt')).toEqual(false);
            expect(library.isTempTargetLanguage('missing')).toEqual(false);
        });

        it('should not add incomplete temporary target language to the database', () => {
            delete language.name;
            testIncomplete('addTempTargetLanguage', language);
        });

        // tested in target language tests
        // it('it should return null for a missing temporary target language', () => {
        //     testMissing('getTargetLanguage', ['missing-lang']);
        // });

        it('should return multiple temporary target languages', () => {
            testMultiple('addTempTargetLanguage', 'getTargetLanguages', language);
        });
    });

    describe('Approved Temporary TargetLanguage', () => {
        var language;
        var tempLanguage;

        beforeEach(() => {
            setUpContext();
            language = {
                slug: 'en',
                name: 'English',
                anglicized_name: 'American English',
                direction: 'ltr',
                region: 'United States',
                is_gateway_language: 0
            };
            tempLanguage = {
                slug: 'temp-en',
                name: 'Temp English',
                anglicized_name: 'American English',
                direction: 'ltr',
                region: 'United States',
                is_gateway_language: 0
            };
            if(!library.addTargetLanguage(language)) throw new Error('Failed to setup target language');
            if(!library.addTempTargetLanguage(tempLanguage)) throw new Error('Failed to setup temp target language');
        });

        it('should assign the approved target language to a temporary target language', () => {
            var success = library.setApprovedTargetLanguage(tempLanguage.slug, language.slug);
            expect(success).toBeTruthy();
            var result = library.public_getters.getApprovedTargetLanguage(tempLanguage.slug);
            delete result.id;
            expect(result).toEqual(language);
        });
    });

    describe('Projects', () => {
        var source_language_en;
        var source_language_de;
        var source_language_fr;
        var project;
        var projectAlt;


        beforeEach(() => {
            setUpContext();

            source_language_en = {
                slug: 'en',
                name: 'English',
                direction: 'ltr'
            };
            source_language_en.id = library.addSourceLanguage(source_language_en);
            source_language_de = {
                slug: 'de',
                name: 'Deutsch',
                direction: 'ltr'
            };
            source_language_de.id = library.addSourceLanguage(source_language_de);
            source_language_fr = {
                slug: 'fr',
                name: 'French',
                direction: 'ltr'
            };
            source_language_fr.id = library.addSourceLanguage(source_language_fr);
            project = {
                slug: 'gen',
                name: 'Genesis',
                desc: 'The book of Genesis',
                icon: '',
                sort: 1,
                chunks_url: 'https://api.unfoldingword.org/bible/txt/1/gen/chunks.json',
                categories: [{
                    name: 'Old Testament',
                    slug: 'bible-ot'
                }],
                source_language_slug: source_language_en.slug,
                source_language_id: source_language_en.id
            };
            projectAlt = alter(project, ['name', 'desc', 'icon', 'chunks_url']);
        });

        it('should add a project to the database', () => {
            testInsert('addProject', 'getProject', project,
                [source_language_en.id], [source_language_en.slug],
                ['id', 'category_id', 'category_slug', 'categories']);
        });

        it('should update a project in the database', () => {
            testUpdate('addProject', 'getProject', project, projectAlt,
                [source_language_en.id], [source_language_en.slug],
                ['id', 'category_id', 'category_slug', 'categories']);
        });

        it('should not add incomplete project to the database', () => {
            delete project.name;
            testIncomplete('addProject', project, [source_language_en.id]);
        });

        it('it should return null for a missing project', () => {
            testMissing('getProject', [source_language_en.slug, 'missing-proj']);
            testMissing('getProject', ['missing-lang', 'missing-proj']);
        });

        it('should return multiple projects', () => {
            testMultiple('addProject', 'getProjects', project,
                [source_language_en.id], [source_language_en.slug]);
        });

        it('should return project categories in a single language', () => {
            // projects with no category
            var project1 = _.cloneDeep(project);
            project1.slug = 'proj-1';
            delete project1.categories;
            var project2 = _.cloneDeep(project);
            project2.slug = 'proj-2';
            delete project2.categories;
            // projects with category
            var project3 = _.cloneDeep(project);
            project3.slug = 'proj-3';
            project3.categories = [{
                name: 'First Cat',
                slug: 'first-cat'
            }];
            var project4 = _.cloneDeep(project);
            project4.slug = 'proj-4';
            project4.categories = [{
                name: 'Second Cat',
                slug: 'second-cat'
            }];

            library.addProject(project1, source_language_fr.id);
            library.addProject(project1, source_language_de.id);
            var id1 = library.addProject(project1, source_language_en.id);

            library.addProject(project2, source_language_fr.id);
            library.addProject(project2, source_language_de.id);
            var id2 = library.addProject(project2, source_language_en.id);

            library.addProject(project3, source_language_fr.id);
            library.addProject(project3, source_language_de.id);
            var id3 = library.addProject(project3, source_language_en.id);

            library.addProject(project4, source_language_fr.id);
            library.addProject(project4, source_language_de.id);
            var id4 = library.addProject(project4, source_language_en.id);

            var resource_all = {
                slug: 'ulb',
                name: 'Unlocked Literal Bible',
                type: 'book',
                status: {
                    translate_mode: 'all',
                    checking_level: '3',
                    version: '3'
                },
                formats: [{
                    package_version: 1,
                    mime_type: 'application/ts+book',
                    modified_at: 20151222120130,
                    url: 'https://api.unfoldingword.org/ts/txt/2/gen/en/ulb/source.json'
                }]
            };
            var resource_gl = _.cloneDeep(resource_all);
            resource_gl.status.translate_mode = 'gl';

            library.addResource(resource_all, id1);
            library.addResource(resource_all, id2);
            library.addResource(resource_all, id3);

            library.addResource(resource_gl, id4);

            // all translate mode
            var allModeResult = library.public_getters.getProjectCategories(0, source_language_en.slug, 'all');
            expect(allModeResult.length).toEqual(3); // 2 projects and 1 category
            var numAllProj = 0;
            allModeResult.forEach(function(item) {
                if(item.type == 'project') {
                    numAllProj ++;
                    expect(item.category_slug).not.toBeNull();
                }
            });
            expect(numAllProj).toEqual(2);

            // gl translate mode
            var glModeResult = library.public_getters.getProjectCategories(0, source_language_en.slug, 'gl');
            expect(glModeResult.length).toEqual(1); // 1 category
            var numGlCategory = 0;
            glModeResult.forEach(function(item) {
                if(item.type == 'category') numGlCategory ++;
            });
            expect(numGlCategory).toEqual(1);

            // de
            var deResult = library.public_getters.getProjectCategories(0, source_language_de.slug, null);
            expect(deResult.length).toEqual(4);
            deResult.forEach(function(item) {
                expect(item.source_language_slug).toEqual(source_language_de.slug);
            });

            // fr
            var frResult = library.public_getters.getProjectCategories(0, source_language_fr.slug, null);
            expect(frResult.length).toEqual(4);
            frResult.forEach(function(item) {
                expect(item.source_language_slug).toEqual(source_language_fr.slug);
            });

            // en
            var enResult = library.public_getters.getProjectCategories(0, source_language_en.slug, null);
            expect(enResult.length).toEqual(4);
            enResult.forEach(function(item) {
                expect(item.source_language_slug).toEqual(source_language_en.slug);
            });

            // default (en)
            var missingLangId = 'missing';
            var defaultResult = library.public_getters.getProjectCategories(0, missingLangId, null);
            expect(defaultResult.length).toEqual(4);
            defaultResult.forEach(function(item) {
                expect(item.source_language_slug).toEqual(source_language_en.slug);
            });
        });

        it('should return one project categories in mixed languages', () => {
            // projects with no category
            var project1 = _.cloneDeep(project);
            project1.slug = 'proj-1';
            delete project1.categories;
            var project2 = _.cloneDeep(project);
            project2.slug = 'proj-2';
            delete project2.categories;
            // projects with category
            var project3 = _.cloneDeep(project);
            project3.slug = 'proj-3';
            project3.categories = [{
                name: 'First Cat',
                slug: 'first-cat'
            }];
            var project4 = _.cloneDeep(project);
            project4.slug = 'proj-4';
            // TODO: this is breaking things
            project4.categories = [{
                    name: 'Second Cat',
                    slug: 'second-cat'
                }];

            // library.addProject(project1, source_language_fr.id);
            library.addProject(project1, source_language_de.id);
            var id1 = library.addProject(project1, source_language_en.id);

            library.addProject(project2, source_language_fr.id);
            var id2 = library.addProject(project2, source_language_de.id);
            // library.addProject(project2, source_language_en.id);

            library.addProject(project3, source_language_fr.id);
            // library.addProject(project3, source_language_de.id);
            var id3 = library.addProject(project3, source_language_en.id);

            // library.addProject(project4, source_language_fr.id);
            library.addProject(project4, source_language_de.id);
            var id4 = library.addProject(project4, source_language_en.id);

            var resource_all = {
                slug: 'ulb',
                name: 'Unlocked Literal Bible',
                type: 'book',
                status: {
                    translate_mode: 'all',
                    checking_level: '3',
                    version: '3'
                },
                formats: [{
                    package_version: 1,
                    mime_type: 'application/ts+book',
                    modified_at: 20151222120130,
                    url: 'https://api.unfoldingword.org/ts/txt/2/gen/en/ulb/source.json'
                }]
            };
            var resource_gl = _.cloneDeep(resource_all);
            resource_gl.status.translate_mode = 'gl';

            library.addResource(resource_all, id1);
            library.addResource(resource_all, id2);
            library.addResource(resource_all, id3);

            library.addResource(resource_gl, id4);

            const expectLanguageCount = function(result, expectedCounts) {
                var counts = {};
                result.forEach(function(item) {
                    if(!counts[item.source_language_slug]) counts[item.source_language_slug] = 0;
                    counts[item.source_language_slug] ++;
                });
                _.keys(expectedCounts).forEach(function(key) {
                    if(!counts[key]) counts[key] = 0;
                    expect(counts[key]).toEqual(expectedCounts[key]);
                });
            };

            // all translate mode
            var allModeResult = library.public_getters.getProjectCategories(0, source_language_en.slug, 'all');
            expect(allModeResult.length).toEqual(3); // 2 projects and 1 category
            var numAllProj = 0;
            allModeResult.forEach(function(item) {
                if(item.type == 'project') numAllProj ++;
            });
            expect(numAllProj).toEqual(2);

            // gl translate mode
            var glModeResult = library.public_getters.getProjectCategories(0, source_language_en.slug, 'gl');
            expect(glModeResult.length).toEqual(1); // 1 category
            var numGlCategory = 0;
            glModeResult.forEach(function(item) {
                if(item.type == 'category') numGlCategory ++;
            });
            expect(numGlCategory).toEqual(1);

            // de
            var deResult = library.public_getters.getProjectCategories(0, source_language_de.slug, null);
            expectLanguageCount(deResult, {
                de: 3,
                fr: 0,
                en: 1
            });

            // fr
            var frResult = library.public_getters.getProjectCategories(0, source_language_fr.slug, null);
            expectLanguageCount(frResult, {
                de: 0,
                fr: 2,
                en: 2
            });

            // en
            var enResult = library.public_getters.getProjectCategories(0, source_language_en.slug, null);
            expectLanguageCount(enResult, {
                de: 1,
                fr: 0,
                en: 3
            });

            // default (en)
            var missingLangId = 'missing';
            var defaultResult = library.public_getters.getProjectCategories(0, missingLangId, null);
            expectLanguageCount(defaultResult, {
                de: 1,
                fr: 0,
                en: 3
            });
        });

        it('should return categories for a project', () => {
            var project1 = _.cloneDeep(project);
            project1.slug = 'proj-cat-test';
            project1.categories = [{
                    name: 'Second Cat',
                    slug: 'second-cat'
                },
                {
                    name: 'Third Cat',
                    slug: 'third-cat'
                }
            ];
            library.addProject(project1, source_language_en.id);

            let cat = library.public_getters.getCategory('en', 'third-cat');
            expect(cat).not.toEqual(null);
            let categories = library.public_getters.getCategories('en', project1.slug);
            expect(categories.length).toEqual(2);
            expect(categories[0].slug).toEqual('second-cat');
            expect(categories[1].slug).toEqual('third-cat');
        });
    });

    describe('Resources', () => {
        var source_language;
        var source_language_alt;
        var project;
        var project_alt;
        var resource;
        var resourceAlt;

        beforeEach(() => {
            setUpContext();

            source_language = {
                slug: 'en',
                name: 'English',
                direction: 'ltr'
            };
            source_language.id = library.addSourceLanguage(source_language);
            source_language_alt = {
                slug: 'de',
                name: 'Deutsch',
                direction: 'ltr'
            };
            source_language_alt.id = library.addSourceLanguage(source_language_alt);
            project = {
                slug: 'gen',
                name: 'Genesis',
                desc: 'The book of Genesis',
                icon: '',
                sort: 1,
                chunks_url: 'https://api.unfoldingword.org/bible/txt/1/gen/chunks.json',
                categories: [{
                    name: 'Old Testament',
                    slug: 'bible-ot'
                }],
                source_language_slug: source_language.slug,
                source_language_id: source_language.id
            };
            project.id = library.addProject(project, source_language.id);
            project_alt = {
                slug: 'gen',
                name: 'Genesis',
                desc: 'The book of Genesis',
                icon: '',
                sort: 1,
                chunks_url: 'https://api.unfoldingword.org/bible/txt/1/gen/chunks.json',
                categories: [{
                    name: 'Old Testament',
                    slug: 'bible-ot'
                }],
                source_language_slug: source_language_alt.slug,
                source_language_id: source_language_alt.id
            };
            project_alt.id = library.addProject(project_alt, source_language_alt.id);
            resource = {
                slug: 'ulb',
                name: 'Unlocked Literal Bible',
                type: 'book',
                translation_words_assignments_url: null,
                status: {
                    translate_mode: 'gl',
                    checking_level: '3',
                    comments: 'this is a comment',
                    pub_date: '2015-12-17',
                    license: 'CC BY-SA',
                    version: '3.0'
                },
                source_language_slug: source_language.slug,
                project_slug: project.slug,
                formats: [{
                    package_version: "1",
                    mime_type: 'application/ts+book',
                    imported: false,
                    modified_at: 20151222120130,
                    url: 'https://api.unfoldingword.org/ts/txt/2/gen/en/ulb/source.json'
                }],
                project_id: project.id
            };
            resourceAlt = alter(resource, ['name']);
            resourceAlt.formats[0].imported = true;
        });

        it('should add a resource to the database', () => {
            testInsert('addResource', 'getResource', resource,
                [project.id], [source_language.slug, project.slug],
                ['id', 'project_id', 'imported']);
        });

        it('should update a resource in the database', () => {
            testUpdate('addResource', 'getResource', resource, resourceAlt,
                [source_language.id, project.id], [source_language.slug, project.slug],
                ['id', 'project_id', 'imported']);
        });

        it('should not add incomplete resource to the database', () => {
            delete resource.name;
            testIncomplete('addResource', resource, [source_language.id, project.id]);
        });

        it('should return null for a missing resource', () => {
            testMissing('getResource', [source_language.slug, project.slug, 'missing-res']);
            testMissing('getResource', [source_language.slug, 'missing-proj', 'missing-res']);
            testMissing('getResource', ['missing-lang', 'missing-proj', 'missing-res']);
        });

        it('should return multiple resources', () => {
            testMultiple('addResource', 'getResources', resource,
                [project.id], [source_language.slug, project.slug]);
        });

        it('should return multiple resources filtered by language', () => {
            library.addResource(resource, project.id);
            library.addResource(alter(resource, ['name', 'slug']), project.id);
            library.addResource(resourceAlt, project_alt.id);

            var result = library.public_getters.getResources(source_language.slug, project.slug);
            expect(result.length).toEqual(2);
        });

        it('should return multiple resources not filtered by language', () => {
            library.addResource(resource, project.id);
            library.addResource(alter(resource, ['name', 'slug']), project.id);
            library.addResource(resourceAlt, project_alt.id);

            var result = library.public_getters.getResources(null, project.slug);
            expect(result.length).toEqual(3);
        });
    });

    describe('Catalogs', () => {
        var catalog;
        var catalogAlt;

        beforeEach(() => {
            setUpContext();

            catalog = {
                slug: 'langnames',
                url: 'td.unfoldingword.org/exports/langnames.json',
                modified_at: 20141222120130
            };
            catalogAlt = alter(catalog, ['url']);
        });

        it('should add a catalog to the database', () => {
            testInsert('addCatalog', 'getCatalog', catalog);
        });

        it('should update a catalog in the database', () => {
            testUpdate('addCatalog', 'getCatalog', catalog, catalogAlt);
        });

        it('should not add incomplete catalog to the database', () => {
            delete catalog.url;
            testIncomplete('addCatalog', catalog);
        });

        it('should return null for a missing catalog', () => {
            testMissing('getCatalog', ['missing-cat']);
        });

        it('should return multiple catalogs', () => {
            testMultiple('addCatalog', 'getCatalogs', catalog);
        });
    });

    describe('Versification', () => {
        var versification;
        var versificationAlt;
        var enLang;
        var deLang;

        beforeEach(() => {
            setUpContext();
            versification = {
                slug: 'en-US',
                name: 'American English'
            };
            versificationAlt = alter(versification, ['name']);
            enLang = {
                slug: 'en',
                name: 'English',
                direction: 'ltr'
            };
            deLang = {
                slug: 'de',
                name: 'Deutsch',
                direction: 'ltr'
            };
            enLang.id = library.addSourceLanguage(enLang);
            deLang.id = library.addSourceLanguage(deLang);
        });

        it('should add a versification to the database', () => {
            testInsert('addVersification', 'getVersification', versification, [enLang.id], [enLang.slug]);
        });

        it('should update a versification in the database', () => {
            testUpdate('addVersification', 'getVersification', versification, versificationAlt, [enLang.id], [enLang.slug])
        });

        it('should not add incomplete versification to the database', () => {
            delete versification.name;
            testIncomplete('addVersification', versification, [enLang.id]);
        });

        it('should return null for a missing versification', () => {
            testMissing('getVersification', ['missing-lang', 'missing-ver']);
        });

        it('should return multiple versifications', () => {
            testMultiple('addVersification', 'getVersifications', versification, [enLang.id], [enLang.slug]);
        });
    });

    describe('ChunkMarker', () => {
        var chunk;
        var chunkAlt;
        var versification;
        var project;

        beforeEach(() => {
            setUpContext();
            project = {
                slug: 'gen',
                name: 'Genesis',
                sort: 1
            };
            chunk = {
                chapter: '01',
                verse: '01',
                project_slug: project.slug
            };
            chunkAlt = alter(chunk, ['verse']);
            versification = {
                slug: 'en-US',
                name: 'American English'
            };
            var langId = library.addSourceLanguage({
                slug: 'en',
                name: 'English',
                direction: 'ltr'
            });
            project.id = library.addProject(project, langId);
            versification.id = library.addVersification(versification, langId);

            /**
             * TRICKY: there is no sensible way to retrieve a single chunk marker
             * so it's not part of the library but we add this utility just for testing
             *
             */
            library.public_getters.getChunkMarker = function(projectSlug, versificationSlug) {
                var chunks = library.public_getters.getChunkMarkers(projectSlug, versificationSlug);
                if(chunks.length > 0) {
                    return chunks[0];
                }
                return null;
            }
        });

        it('should add a chunk marker to the database', () => {
            testInsert('addChunkMarker', 'getChunkMarker', chunk, [project.slug, versification.id],
                [project.slug, versification.slug], ['versification_id', 'project_id']);
        });

        it('should not add incomplete chunk marker to the database', () => {
            delete chunk.chapter;
            testIncomplete('addChunkMarker', chunk, [project.slug, versification.id]);
        });

        it('should return null for a missing chunk marker', () => {
            testMissing('getChunkMarker', ['missing-ver', 'missing-proj']);
        });

        it('should return multiple chunk markers', () => {
            let firstId = library.addChunkMarker(chunk, project.slug, versification.id);
            expect(firstId > 0).toBeTruthy();
            let secondId = library.addChunkMarker(chunkAlt, project.slug, versification.id);
            expect(secondId > 0).toBeTruthy();

            expect(secondId).not.toEqual(firstId);
            let result = library.public_getters.getChunkMarkers(project.slug, versification.slug);
            expect(result.length).toEqual(2);
        });
    });

    describe('Questionnaire', () => {
        var questionnaire;
        var questionnaireAlt;

        beforeEach(() => {
            setUpContext();
            questionnaire = {
                language_slug: 'en',
                language_name: 'English',
                language_direction: 'ltr',
                language_data: {
                    ln: 0,
                    cc: 4
                },
                td_id: 1
            };
            questionnaireAlt = alter(questionnaire, ['language_name']);
            questionnaireAlt.td_id = 2;
        });

        it('should add a questionnaire to the database', () => {
            var id = library.addQuestionnaire(questionnaire);
            expect(id).toBeTruthy();
            var questionnaires = library.public_getters.getQuestionnaires();
            expect(questionnaires.length).toEqual(1);
            delete questionnaires[0].id;
            expect(questionnaires[0]).toEqual(questionnaire);
        });

        it('should update a questionnaire in the database', () => {
            var id = library.addQuestionnaire(questionnaire);
            expect(id).toBeTruthy();
            questionnaireAlt.td_id = questionnaire.td_id;
            var updatedId = library.addQuestionnaire(questionnaireAlt);
            expect(updatedId).toEqual(id);
            var questionnaires = library.public_getters.getQuestionnaires();
            expect(questionnaires.length).toEqual(1);
            expect(questionnaires[0].id).toEqual(id);
            delete questionnaires[0].id;
            expect(questionnaires[0]).toEqual(questionnaireAlt);
        });

        it('should not add incomplete questionnaire to the database', () => {
            delete questionnaire.language_slug;
            var error = null;
            try {
                var id = library.addQuestionnaire(questionnaire);
                expect(id).not.toBeTruthy();
            } catch (e) {
                error = e;
            }
            expect(error).not.toEqual(null);
        });

        it('should return multiple questionnaires', () => {
            library.addQuestionnaire(questionnaire);
            library.addQuestionnaire(questionnaireAlt);
            var result = library.public_getters.getQuestionnaires();
            expect(result.length).toEqual(2);
        });
    });

    describe('Question', () => {
        var question;
        var questionAlt;
        var questionnaireId;
        var independentQuestion;

        beforeEach(() => {
            setUpContext();
            let questionnaire = {
                language_slug: 'en',
                language_name: 'English',
                language_direction: 'ltr',
                language_data: {
                    ln: 0,
                    cc: 4
                },
                td_id: 1
            };
            questionnaireId = library.addQuestionnaire(questionnaire);
            expect(questionnaireId).toBeTruthy();
            question = {
                text: 'This is a question',
                help: 'Give me an answer',
                is_required: 1,
                input_type: 'string',
                sort: 1,
                depends_on: 0,
                td_id: 5
            };
            independentQuestion = {
                text: 'This is a question',
                help: 'Give me an answer',
                is_required: 1,
                input_type: 'string',
                sort: 1,
                depends_on: null,
                td_id: 5
            };
            questionAlt = alter(question, ['text']);
            questionAlt.td_id = 6;
        });

        it('should add an independent question to the database', () => {
            var id = library.addQuestion(independentQuestion, questionnaireId);
            expect(id).toBeTruthy();
            var questions = library.public_getters.getQuestions(questionnaireId);
            expect(questions.length).toEqual(1);
            expect(questions[0].depends_on).toEqual(-1);
        });

        it('should add a question to the database', () => {
            var id = library.addQuestion(question, questionnaireId);
            expect(id).toBeTruthy();
            var questions = library.public_getters.getQuestions(questionnaireId);
            expect(questions.length).toEqual(1);
            delete questions[0].id;
            delete questions[0].questionnaire_id;
            expect(questions[0]).toEqual(question);
        });

        it('should update a question in the database', () => {
            var id = library.addQuestion(question, questionnaireId);
            expect(id).toBeTruthy();
            questionAlt.td_id = question.td_id;
            var updatedId = library.addQuestion(questionAlt, questionnaireId);
            expect(updatedId).toEqual(id);
            var questions = library.public_getters.getQuestions(questionnaireId);
            expect(questions.length).toEqual(1);
            expect(questions[0].id).toEqual(id);
            delete questions[0].id;
            delete questions[0].questionnaire_id;
            expect(questions[0]).toEqual(questionAlt);
        });

        it('should not add incomplete question to the database', () => {
            delete question.text;
            var error = null;
            try {
                var id = library.addQuestion(question, questionnaireId);
                expect(id).not.toBeTruthy();
            } catch (e) {
                error = e;
            }
            expect(error).not.toEqual(null);
        });

        it('should return multiple questions', () => {
            library.addQuestion(question, questionnaireId);
            library.addQuestion(questionAlt, questionnaireId);
            var result = library.public_getters.getQuestions(questionnaireId);
            expect(result.length).toEqual(2);
        });
    });

    describe('Translations', () => {

        beforeEach(() => {
            setUpContext();

            // prep content
            var language = {
                slug: 'en',
                name: 'English',
                direction: 'ltr'
            };
            var language_id = library.addSourceLanguage(language);
            var project = {
                slug: 'gen',
                name: 'Genesis',
                desc: 'The book of Genesis',
                icon: '',
                sort: 1,
                chunks_url: 'https://api.unfoldingword.org/bible/txt/1/gen/chunks.json',
                categories: [{
                    name: 'Old Testament',
                    slug: 'bible-ot'
                }],
                source_language_slug: language.slug,
                source_language_id: language_id
            };
            var project_id = library.addProject(project, language_id);
            var resource = {
                slug: 'ulb',
                name: 'Unlocked Literal Bible',
                type: 'book',
                status: {
                    translate_mode: 'all',
                    checking_level: '3',
                    version: '3'
                },
                formats: [{
                    package_version: 1,
                    mime_type: 'application/ts+book',
                    modified_at: 20151222120130,
                    url: 'https://api.unfoldingword.org/ts/txt/2/gen/en/ulb/source.json'
                }]
            };
            library.addResource(resource, project_id);
            var resource2 = {
                slug: 'udb',
                name: 'Unlocked Dynamic Bible',
                type: 'book',
                status: {
                    translate_mode: 'all',
                    checking_level: '1',
                    version: '1'
                },
                formats: [{
                    package_version: 1,
                    mime_type: 'application/ts+book',
                    modified_at: 20151222120130,
                    url: 'https://api.unfoldingword.org/ts/txt/2/gen/en/udb/source.json'
                }]
            };
            library.addResource(resource2, project_id);
        });

        it('should return a list of translations', () => {
            var translations = library.public_getters.findTranslations('en', 'gen', null, null, null, 0, -1);
            expect(translations.length).toEqual(2);

            translations = library.public_getters.findTranslations('en', 'gen', null, null, null, 3, -1);
            expect(translations.length).toEqual(1);
        });

    });
});
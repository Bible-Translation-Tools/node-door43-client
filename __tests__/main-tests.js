'use strict';

jest.unmock('fs');
jest.unmock('mkdirp');
jest.unmock('rimraf');
jest.unmock('../lib/utils/promises');
jest.unmock('../lib/utils/files');
jest.unmock('../lib/main');
jest.unmock('yamljs');
jest.unmock('lodash');
jest.unmock('path');

const path = require('path');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const fileUtils = require('../lib/utils/files');

const config = {
    schemaPath: path.normalize(path.join(__dirname, '../lib/schema.sqlite')),
    dbPath: './out/test.client.sqlite',
    resDir: './out/test.res.client/',
    catalogUrl: 'https://api.unfoldingword.org/ts/txt/2/catalog.json'
};

describe('Client', () => {
    var client, request, library;

    beforeEach(() => {
        rimraf.sync(config.dbPath);
        rimraf.sync(config.resDir);
        var Client = require('../');
        client = new Client(config.dbPath, config.resDir);
        var Library = require('../lib/library');
        library = new Library(null);
        request = require('../lib/request');
    });

    it('should index the questionnaires', () => {
        library.__queueResponse = {slug: 'new-language-questions', url: 'some url', modified: 0};
        request.__setStatusCode = 200;
        request.__queueResponse = JSON.stringify({
            languages: [{
                questions: [{
                    text: "What do you call your language?",
                    depends_on: null,
                    sort: 1,
                    help: "",
                    required: true,
                    input_type: "string",
                    id: 0
                },
                {
                    text: "Does that have a special meaning?",
                    depends_on: 0,
                    sort: 2,
                    help: "",
                    required: false,
                    input_type: "string",
                    id: 1
                },
                {
                    text: "Do you have other names for your language?",
                    depends_on: 0,
                    sort: 3,
                    help: "",
                    required: false,
                    input_type: "string",
                    id: 2
                },
                {
                    text: "Is your language written from left to right?",
                    depends_on: null,
                    sort: 4,
                    help: "",
                    required: true,
                    input_type: "boolean",
                    id: 3
                },
                {
                    text: "What country are you in?",
                    depends_on: null,
                    sort: 5,
                    help: "",
                    required: true,
                    input_type: "string",
                    id: 4
                }],
                slug: 'en',
                questionnaire_id: 1,
                language_data: {
                    ln: 0,
                    cc: 4
                },
                dir: 'ltr',
                name: 'English'
            }]
        });

        return client.legacy_tools.updateCatalog('new-language-questions')
            .then(function() {
                // TODO: assert things worked
            });
    });

    it('should index target languages', () => {
        // langs
        library.__queueResponse = {
            slug: 'langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {"pk": 1, "cc": ["US"], "ln": "English", "ld": "ltr", "lc": "en", "alt": [], "gw": true, "ang": "English", "lr": "North America"}
        ]);

        // temp langs
        library.__queueResponse = {
            slug: 'temp-langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {"pk": 1, "cc": ["US"], "ln": "Temp English", "ld": "ltr", "lc": "qaa-x-temp-en", "alt": [], "gw": true, "ang": "Temp English", "lr": "North America"}
        ]);

        // approved langs
        library.__queueResponse = {
            slug: 'approved-temp-langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {"qaa-x-temp-en": "en"}
        ]);

        return client.legacy_tools.updateCatalog('langnames')
            .then(function(response) {
                return client.legacy_tools.updateCatalog('temp-langnames');
            })
            .then(function(response) {
                return client.legacy_tools.updateCatalog('approved-temp-langnames');
            })
            .then(function(response) {
                expect(library.addTargetLanguage.mock.calls.length).toEqual(1);
                expect(library.addTempTargetLanguage.mock.calls.length).toEqual(1);
                expect(library.setApprovedTargetLanguage.mock.calls.length).toEqual(1);
            });
    });

    it('should update a target language in the right table', () => {
        const language = {slug: 'aa', name: 'Afar', direction: 'ltr'};
        library.isTempTargetLanguage.mockReturnValueOnce(false);
        expect(client.updateTargetLanguage(language)).toBeTruthy();
        expect(library.addTargetLanguage.mock.calls.length).toEqual(1);
        expect(library.addTempTargetLanguage.mock.calls.length).toEqual(0);

        library.isTempTargetLanguage.mockReturnValueOnce(true);
        expect(client.updateTargetLanguage(language)).toBeTruthy();
        expect(library.addTempTargetLanguage.mock.calls.length).toEqual(1);
    });

    it('should index the Door43 catalog', () => {
        request.__setStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {
                date_modified: "20160620",
                lang_catalog: "https://api.unfoldingword.org/ts/txt/2/1ch/languages.json?date_modified=20160620",
                meta: [
                    "bible-ot"
                ],
                slug: "1ch",
                sort: "13"
            }
        ]);
        request.__queueResponse = JSON.stringify([
            {
                language: {
                    date_modified: "20160614",
                    direction: "ltr",
                    name: "English",
                    slug: "en"
                },
                project: {
                    desc: "",
                    meta: [
                        "Bible: OT"
                    ],
                    name: "1 Chronicles",
                    sort: "13"
                },
                res_catalog: "https://api.unfoldingword.org/ts/txt/2/1ch/en/resources.json?date_modified=20160614"
            }
        ]);
        request.__queueResponse = JSON.stringify([
            {
                checking_questions: "https://api.unfoldingword.org/ts/txt/2/1ch/en/questions.json?date_modified=20160504",
                date_modified: "20160614",
                name: "Unlocked Literal Bible",
                notes: "https://api.unfoldingword.org/ts/txt/2/1ch/en/notes.json?date_modified=20160504",
                slug: "ulb",
                source: "https://api.unfoldingword.org/ts/txt/2/1ch/en/ulb/source.json?date_modified=20160614",
                status: {
                    checking_entity: "Wycliffe Associates",
                    checking_level: "3",
                    comments: "Original source text",
                    contributors: "Wycliffe Associates",
                    publish_date: "20160614",
                    source_text: "en",
                    source_text_version: "5",
                    version: "5"
                },
                terms: "https://api.unfoldingword.org/ts/txt/2/bible/en/terms.json?date_modified=20160504",
                tw_cat: "https://api.unfoldingword.org/ts/txt/2/1ch/en/tw_cat.json?date_modified=20160504",
                usfm: "https://api.unfoldingword.org/ulb/txt/1/ulb-en/13-1CH.usfm?date_modified=20160614"
            }
        ]);
        library.__queueResponse = JSON.stringify({
            name: 'American English',
            slug: 'en-US',
            id: 1
        });

        return client.legacy_tools.updateResources(config.catalogUrl)
            .then(() => {
                expect(library.addProject.mock.calls.length).toEqual(2); // project, words
                expect(library.addSourceLanguage.mock.calls.length).toEqual(1);

                // expect(library.addChunkMarker.mock.calls.length).toEqual(3); // chunks
                expect(library.addResource.mock.calls.length).toEqual(4); // content, notes, questions, words
            })
            .catch(function(err) {
                throw err;
            });
    });

    it('should fail to index the Door43 catalog', () => {
        request.__setStatusCode = 400;
        return client.legacy_tools.updateResources(config.catalogUrl)
            .then(() => {
                throw new Error();
            })
            .catch(function(err) {
                expect(err.status).toEqual(400);
                expect(library.addProject.mock.calls.length).toEqual(0);
                expect(library.addSourceLanguage.mock.calls.length).toEqual(0);
                expect(library.addResource.mock.calls.length).toEqual(0);
            });
    });

    it('should download a global catalog', () => {
        library.__queueResponse = {
            slug: 'langnames',
            url: 'http://td.unfoldingword.org/exports/langnames.json',
            modified_at: 0,
            id: 1
        };
        request.__queueResponse = JSON.stringify([
            {
                ang: "Afar",
                pk: 6,
                lr: "Africa",
                ln: "Afaraf",
                cc: [
                    "DJ",
                    "ER",
                    "ET",
                    "US",
                    "CA"
                ],
                ld: "ltr",
                gw: false,
                lc: "aa",
                alt: [
                    "Afaraf",
                    "Danakil",
                    "Denkel",
                    "Adal",
                    "Afar Af",
                    "Qafar",
                    "Baadu (Ba'adu)"
                ]
            },
            {
                ang: "Ghotuo",
                pk: 7,
                lr: "Africa",
                ln: "Ghotuo",
                cc: [
                    "NG"
                ],
                ld: "ltr",
                gw: false,
                lc: "aaa",
                alt: [ ]
            }
        ]);
        return client.legacy_tools.updateCatalog('langnames')
            .then(() => {
                expect(library.addTargetLanguage.mock.calls.length).toEqual(2);
            })
            .catch(function(err) {
                throw err;
            });

    });

    it('should not download a missing global catalog', () => {
        library.__queueResponse = null;

        return client.legacy_tools.updateCatalog('langnames')
            .then(() => {
                expect(library.addTargetLanguage.mock.calls.length).toEqual(0);
            })
            .catch(function(err) {
                expect(err.message).toEqual('Unknown catalog');
            });

    });

    it('should fail to download a global catalog', () => {
        library.__queueResponse = {
            slug: 'langnames',
            url: 'http://td.unfoldingword.org/exports/langnames.json',
            modified_at: 0,
            id: 1
        };
        request.__setStatusCode = 400;

        return client.legacy_tools.updateCatalog('langnames')
            .then(() => {
                expect(library.addTargetLanguage.mock.calls.length).toEqual(0);
            })
            .catch(function(err) {
                expect(err.status).toEqual(400);
            });

    });

    it('should download a resource container', () => {
        let fs = require('fs');
        let archiveDir = path.join(config.resDir, 'en_obs_obs');
        let archiveFile = archiveDir + '.tsrc';
        fs.writeFileSync(archiveFile, 'some file');
        mkdirp(archiveDir);

        let rc = require('resource-container');

        expect(fileUtils.fileExists(archiveFile)).toBeTruthy();
        expect(fileUtils.fileExists(archiveDir)).toBeTruthy();

        library.__queueResponse = {
            id: 1,
            slug: 'obs',
            formats: [
                {
                    syntax_version: '1.0',
                    mime_type: 'application/tsrc+book',
                    modified_at: 0,
                    url: 'some/url',
                }
            ]
        };

        return client.legacy_tools.downloadFutureCompatibleResourceContainer('en', 'obs', 'obs')
            .then(() => {
                expect(request.download.mock.calls.length).toEqual(1);
                expect(fileUtils.fileExists(archiveFile)).toBeTruthy();
                expect(fileUtils.fileExists(archiveDir)).not.toBeTruthy();
                expect(fileUtils.fileExists(path.join(config.resDir, 'en_obs_obs.tsrc'))).toBeTruthy();
                expect(fileUtils.fileExists(path.join(config.resDir, 'en_obs_obs'))).not.toBeTruthy();
            })
            .catch(function(err) {
                throw err;
            });
    });

    it('should not download a missing resource container', () => {
        library.__queueResponse = null;

        return client.legacy_tools.downloadFutureCompatibleResourceContainer('en', 'obs', 'obs')
            .then(() => {
                throw Error();
            })
            .catch(function(err) {
                expect(err.message).toEqual('Unknown resource');
                expect(request.download.mock.calls.length).toEqual(0);
                expect(fileUtils.fileExists(path.join(config.resDir, 'en_obs_obs.tsrc'))).not.toBeTruthy();
            });
    });

    it('should not download a missing resource container format', () => {
        library.__queueResponse = {
            id: 1,
            slug: 'obs',
            type: 'book',
            formats: [
                {
                    syntax_version: '1.0',
                    mime_type: 'pdf',
                    modified_at: 0,
                    url: 'some/url',
                }
            ]
        };

        return client.legacy_tools.downloadFutureCompatibleResourceContainer('en', 'obs', 'obs')
            .then(() => {
                throw Error();
            })
            .catch(function(err) {
                expect(err.message).toEqual('Missing resource container format');
                expect(request.download.mock.calls.length).toEqual(0);
                expect(fileUtils.fileExists(path.join(config.resDir, 'en_obs_obs.tsrc'))).not.toBeTruthy();
            });
    });

    it('should not download a resource container with no formats', () => {
        library.__queueResponse = {
            id: 1,
            slug: 'obs',
            formats: []
        };

        return client.legacy_tools.downloadFutureCompatibleResourceContainer('en', 'obs', 'obs')
            .then(() => {
                throw Error();
            })
            .catch(function(err) {
                expect(err.message).toEqual('Missing resource container format');
                expect(request.download.mock.calls.length).toEqual(0);
                expect(fileUtils.fileExists(path.join(config.resDir, 'en_obs_obs.tsrc'))).not.toBeTruthy();
            });
    });

    it('should fail downloading a resource container', () => {
        library.__queueResponse = {
            id: 1,
            slug: 'obs',
            formats: [
                {
                    syntax_version: '1.0',
                    mime_type: 'application/tsrc+book',
                    modified_at: 0,
                    url: 'some/url',
                }
            ]
        };
        request.__setStatusCode = 400;

        return client.legacy_tools.downloadFutureCompatibleResourceContainer('en', 'obs', 'obs')
            .then(() => {
                throw Error();
            })
            .catch(function(err) {
                expect(err.status).toEqual(400);
                expect(request.download.mock.calls.length).toEqual(1);
                expect(fileUtils.fileExists(path.join(config.resDir, 'en_obs_obs.tsrc'))).not.toBeTruthy();
            });
    });

    it('should build a resource container', () => {
        // TODO: this is deprecated and should be moved to the rc module.
        var fs = require('fs');

        library.__queueResponse = {
            id: 1,
            slug: 'en',
            name: 'English',
            direction: 'ltr'
        };
        library.__queueResponse = {
            id: 1,
            slug: 'obs',
            name: 'Open Bible Stories',
            desc: 'T',
            icon: '',
            sort: 0,
            chunks_url: '',
            categories: [],
            source_language_slug: 'en',
            source_language_id: 1
        };
        library.__queueResponse = [
            {name: 'New Testament', slug: 'bible-nt'}
        ];
        library.__queueResponse = {
            id: 1,
            slug: 'obs',
            name: 'Open Bible Stories',
            status: {
                translate_mode: 'all',
                checking_entity: [
                    'Wycliffe Associates'
                ],
                checking_level: '3',
                comments: 'this is a comment',
                contributors: [
                    'Wycliffe Associates'
                ],
                pub_date: '2015-12-17',
                license: 'CC BY-SA',
                checks_performed: [
                    'keyword',
                    'metaphor'
                ],
                source_translations: [
                    {
                        language_slug: 'en',
                        resource_slug: 'obs',
                        version: '3.0'
                    }
                ],
                version: '3.0'
            },
            formats: [{
                syntax_version: '1.0',
                mime_type: 'application/tsrc+book',
                modified_at: 20151222120130,
                url: 'https://api.unfoldingword.org/ts/txt/2/obs/en/obs/source.json'
            }],
            translation_words_assignments_url: 'https://api.unfoldingword.org/obs/txt/1/en/tw_cat-en.json?date_modified=20150924',
            project_id: 1,
            project_slug: 'obs',
            source_language_slug: 'en'
        };

        request.__queueResponse = JSON.stringify({"chapters": [{"frames": [{"id": "01", "items": [{"id": "god"}, {"id": "holyspirit"}]}, {"id": "02", "items": [{"id": "god"}, {"id": "good"}]}, {"id": "03", "items": [{"id": "god"}]}, {"id": "04", "items": [{"id": "god"}, {"id": "good"}]}, {"id": "05", "items": [{"id": "god"}, {"id": "good"}]}, {"id": "06", "items": [{"id": "god"}, {"id": "good"}]}, {"id": "07", "items": [{"id": "bless"}, {"id": "god"}, {"id": "good"}]}, {"id": "08", "items": [{"id": "god"}, {"id": "good"}]}, {"id": "09", "items": [{"id": "god"}]}, {"id": "10", "items": [{"id": "adam"}, {"id": "god"}, {"id": "life"}]}, {"id": "11", "items": [{"id": "adam"}, {"id": "death"}, {"id": "evil"}, {"id": "god"}, {"id": "good"}, {"id": "life"}]}, {"id": "12", "items": [{"id": "adam"}, {"id": "god"}, {"id": "good"}]}, {"id": "13", "items": [{"id": "adam"}, {"id": "god"}]}, {"id": "14", "items": [{"id": "adam"}]}, {"id": "15", "items": [{"id": "bless"}, {"id": "god"}, {"id": "good"}]}, {"id": "16", "items": [{"id": "bless"}, {"id": "god"}, {"id": "holy"}]}], "id": "01"}, {"frames": [{"id": "01", "items": [{"id": "adam"}, {"id": "god"}, {"id": "sin"}]}, {"id": "02", "items": [{"id": "god"}]}, {"id": "03", "items": [{"id": "death"}, {"id": "evil"}, {"id": "god"}, {"id": "good"}]}, {"id": "04", "items": [{"id": "death"}, {"id": "evil"}, {"id": "god"}, {"id": "good"}, {"id": "true"}]}, {"id": "05", "items": [{"id": "wise"}]}, {"id": "06", "items": []}, {"id": "07", "items": [{"id": "adam"}, {"id": "god"}]}, {"id": "08", "items": [{"id": "god"}]}, {"id": "09", "items": [{"id": "curse"}, {"id": "descendant"}, {"id": "god"}]}, {"id": "10", "items": [{"id": "god"}]}, {"id": "11", "items": [{"id": "adam"}, {"id": "curse"}, {"id": "death"}, {"id": "disobey"}, {"id": "eve"}, {"id": "god"}]}, {"id": "12", "items": [{"id": "adam"}, {"id": "angel"}, {"id": "eve"}, {"id": "evil"}, {"id": "god"}, {"id": "good"}, {"id": "life"}]}], "id": "02"}], "date_modified": "20150924"});

        var data = {
            chapters: [
                {
                    frames: [
                        {
                            id: "01-01",
                            img: "https://api.unfoldingword.org/obs/jpg/1/en/360px/obs-en-01-01.jpg",
                            text: "This is how the beginning of everything happened. God created the universe and everything in it in six days. After God created the earth it was dark and empty, and nothing had been formed in it. But God’s Spirit was there over the water."
                        },
                        {
                            id: "01-02",
                            img: "https://api.unfoldingword.org/obs/jpg/1/en/360px/obs-en-01-02.jpg",
                            text: "Then God said, “Let there be light!” And there was light. God saw that the light was good and called it “day.” He separated it from the darkness, which he called “night.” God created the light on the first day of creation."
                        }
                    ],
                    number: "01",
                    ref: "A Bible story from: Genesis 1-2",
                    title: "1. The Creation"
                },
                {
                    frames: [
                        {
                            id: "02-01",
                            img: "https://api.unfoldingword.org/obs/jpg/1/en/360px/obs-en-02-01.jpg",
                            text: "Adam and his wife were very happy living in the beautiful garden God had made for them. Neither of them wore clothes, but this did not cause them to feel any shame, because there was no sin in the world. They often walked in the garden and talked with God."
                        },
                        {
                            id: "02-02",
                            img: "https://api.unfoldingword.org/obs/jpg/1/en/360px/obs-en-02-02.jpg",
                            text: "But there was a crafty snake in the garden. He asked the woman, “Did God really tell you not to eat the fruit from any of the trees in the garden?”"
                        }
                    ],
                    number: "02",
                    ref: "A Bible story from: Genesis 3",
                    title: "2. Sin Enters the World"
                }
            ]
        };

        return client.legacy_tools.convertResource('en', 'obs', 'obs', JSON.stringify(data))
            .then(function(container) {
                let rc = require('resource-container');
                expect(rc.tools.makeSlug.mock.calls.length).toEqual(1);
                expect(library.public_getters.getSourceLanguage.mock.calls.length).toEqual(1);
                expect(library.public_getters.getProject.mock.calls.length).toEqual(1);
                expect(library.public_getters.getResource.mock.calls.length).toEqual(1);
                expect(rc.tools.convertResource.mock.calls.length).toEqual(1);
                expect(container).not.toBeNull();
            });
    });
});

describe('Import', () => {
    var client, library, fs, rc;

    beforeEach(() => {
        jest.mock('fs');
        jest.mock('rimraf');
        jest.mock('ncp');

        fs = require('fs');
        rc = require('resource-container');
        var Client = require('../');

        fs.writeFileSync(config.schemaPath, '');
        fs.writeFileSync(config.dbPath, '');

        client = new Client(config.dbPath, config.resDir);
        var Library = require('../lib/library');
        library = new Library(null);
    });

    it('should import a resource container', () => {
        let fs = require('fs');
        let archiveDir = path.join(config.resDir, 'en_obs_obs');
        let archiveFile = archiveDir + '.tsrc';
        fs.writeFileSync(archiveFile, 'some file');
        mkdirp(archiveDir);

        rc.__queueResponse = {
            slug: 'en-obs-obs',
            language: { slug: 'en'},
            project: { slug: 'gen'},
            resource: { slug: 'ulb', status: { checking_level: '2'}},
            get info() {
                return {
                    project : {
                        categories: ['bible-ot']
                    }
                };
            }
        };

        library.__queueResponse = { };
        library.__queueResponse = { name: 'Old Testament', slug: 'bible-ot'};
        library.__queueResponse = {
            id: 1,
            slug: 'ulb',
            formats: [
                {
                    syntax_version: '0.1',
                    mime_type: 'application/tsrc+book',
                    modified_at: 0,
                    url: 'some/url',
                }
            ]
        };

        fs.writeFileSync('/container_to_import/package.json', '');
        fs.writeFileSync('container_to_import/LICENSE.md', 'some license');
        fs.writeFileSync('container_to_import/content/config.yml', '');

        return client.importResourceContainer('/container_to_import')
            .then((container) => {
                // just making sure no errors are throw
            })
            .catch(function(err) {
                throw err;
            });
    });
});

describe('Update check', () => {

    var client, request, library, fs, rc;

    beforeEach(() => {
        jest.mock('fs');

        fs = require('fs');
        rc = require('resource-container');
        var Client = require('../');

        fs.writeFileSync(config.schemaPath, '');
        fs.writeFileSync(config.dbPath, '');

        client = new Client(config.dbPath, config.resDir);
        var Library = require('../lib/library');
        library = new Library(null);
        request = require('../lib/request');
    });

    it('should display a list of available language updates', () => {
        // downloaded containers
        fs.writeFileSync(config.resDir + '1en-container.ts', '');
        fs.writeFileSync(config.resDir + '2de-container.ts', '');
        fs.writeFileSync(config.resDir + 'de-container', '');
        fs.writeFileSync(config.resDir + '3ru-container.ts', '');
        // indexed projects
        library.__queueResponse = [
            {
                slug: 'fr',
                modified_at: 100
            },
            {
                slug: 'es',
                modified_at: 0
            },
            {
                slug: 'en',
                modified_at: 100
            },
            {
                slug: 'de',
                modified_at: 0
            },
            {
                slug: 'ru',
                modified_at: 1
            }
        ];
        // downloaded container info
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 0,
            content_mime_type: 'text/usfm',
            language: {
                slug: 'en'
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 100,
            content_mime_type: 'text/usfm',
            language: {
                slug: 'de'
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 1,
            content_mime_type: 'text/usfm',
            language: {
                slug: 'ru'
            }
        };
        let expected = ['en'];
        return client.findUpdates.sourceLanguages()
            .then(function(languages) {
                expect(languages.sort()).toEqual(expected.sort());
            });
    });

    it('should display a list of available project updates', () => {
        // downloaded containers
        fs.writeFileSync(config.resDir + '1gen-container.ts', '');
        fs.writeFileSync(config.resDir + '2ex-container.ts', '');
        fs.writeFileSync(config.resDir + 'ex-container', '');
        fs.writeFileSync(config.resDir + '3num-container.ts', '');
        // indexed projects
        library.__queueResponse = [
            {
                slug: 'obs',
                modified_at: 100
            },
            {
                slug: 'lev',
                modified_at: 0
            },
            {
                slug: 'gen',
                modified_at: 100
            },
            {
                slug: 'ex',
                modified_at: 0
            },
            {
                slug: 'num',
                modified_at: 1
            }
        ];
        // downloaded container info
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 0,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'gen'
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 100,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'ex'
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 1,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'num'
            }
        };
        let expected = ['gen'];
        return client.findUpdates.projects()
            .then(function(projects) {
                expect(projects.sort()).toEqual(expected.sort());
            });
    });

    it('should display a list of available project updates within a single source language', () => {
        let langSlug = 'en';
        // downloaded containers
        fs.writeFileSync(config.resDir + '1gen-container.ts', '');
        fs.writeFileSync(config.resDir + '2ex-container.ts', '');
        fs.writeFileSync(config.resDir + '3ex-container', '');
        fs.writeFileSync(config.resDir + '4num-container.ts', '');
        fs.writeFileSync(config.resDir + '5dut-container.ts', '');
        // indexed projects
        library.__queueResponse = [
            {
                slug: 'obs',
                modified_at: 100
            },
            {
                slug: 'lev',
                modified_at: 0
            },
            {
                slug: 'gen',
                modified_at: 100
            },
            {
                slug: 'ex',
                modified_at: 0
            },
            {
                slug: 'num',
                modified_at: 1
            },
            {
                slug: 'dut',
                modified_at: 100
            }
        ];
        // downloaded container info
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 0,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'gen'
            },
            language: {
                slug: 'es'
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 100,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'ex'
            },
            language: {
                slug: langSlug
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 1,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'num'
            },
            language: {
                slug: langSlug
            }
        };
        rc.__queueResponse = {
            package_version: '1.0',
            type: 'book',
            modified_at: 0,
            content_mime_type: 'text/usfm',
            project: {
                slug: 'dut'
            },
            language: {
                slug: langSlug
            }
        };
        let expected = ['dut'];
        return client.findUpdates.projects(langSlug)
            .then(function(projects) {
                expect(projects.sort()).toEqual(expected.sort());
            });
    });

    it('should download and index tA', function() {
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify({
            articles: [
                {
                    depend: [
                        "ta_intro",
                        "translation_guidelines",
                        "finding_answers"
                    ],
                    id: "translate_manual",
                    question: "What is the Translation Manual?",
                    recommend: [
                        "translate_why",
                        "guidelines_intro",
                        "translate_process",
                        "translation_difficulty"
                    ],
                    ref: "vol1/translate/translate_manual",
                    text: "### What Does the Translation Manual Teach? This manual teaches translation theory and how to make a good translation for Other Languages (OLs). Some of the principles of translation in this manual also apply to Gateway Language translation. For specific instruction on how to translate the set of translation tools for Gateway Languages, however, please see the Gateway Language Manual. It will be very helpful to study many of these modules before starting any type of translation project. Other modules, such as the ones about grammar, are only needed for \"just-in-time\" learning. Some highlights in the Translation Manual: * [The Qualities of a Good Translation](https://git.door43.org/Door43/en-ta-translate-vol1/src/master/content/guidelines_intro.md) - defining a good translation * [The Translation Process](https://git.door43.org/Door43/en-ta-translate-vol1/src/master/content/translate_process.md) - how to achieve a good translation * [Choosing a Translation Team](https://git.door43.org/Door43/en-ta-translate-vol1/src/master/content/choose_team.md) - some items to consider before starting a translation project * [Choosing What to Translate](https://git.door43.org/Door43/en-ta-translate-vol1/src/master/content/translation_difficulty.md) - what to start translating ",
                    title: "Introduction to Translation Manual"
                }
            ],
            meta: {
                language: {
                    anglicized_name: "English",
                    direction: "ltr",
                    lc: "en",
                    name: "English"
                },
                manual: "translate",
                manual_title: "Translation Manual Volume 1",
                mod: 1467416351,
                status: {
                    checking_entity: "Wycliffe Associates",
                    checking_level: "3",
                    comments: "",
                    contributors: "unfoldingWord; Wycliffe Associates",
                    license: "CC BY-SA 4.0",
                    publish_date: "2016-07-01",
                    source_text: "en",
                    source_text_version: "5",
                    version: "5"
                },
                volume: "1"
            }
        });
        request.__setStatusCode = 400;

        return client.legacy_tools.updateTA()
            .then(() => {
                expect(library.addSourceLanguage.mock.calls.length).toEqual(1);
                expect(library.addProject.mock.calls.length).toEqual(1);
                expect(library.addResource.mock.calls.length).toEqual(1);
            })
            .catch((err) => {
                expect(err.status).toEqual(400);
            });
    });

    it('should download and index chunks', function() {
        library.__queueResponse = [{
            slug: 'gen',
            chunks_url: 'some/url'
        }];
        library.__queueResponse = {
            name: 'American English',
            slug: 'en-US',
            id: 1
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {
                chp: "01",
                firstvs: "01"
            },
            {
                chp: "01",
                firstvs: "03"
            },
            {
                chp: "01",
                firstvs: "06"
            },
            {
                chp: "01",
                firstvs: "09"
            }
        ]);
        request.__setStatusCode = 400;

        return client.updateChunks()
            .then(() => {
                expect(library.addChunkMarker.mock.calls.length).toEqual(4);
                expect(library.addVersification.mock.calls.length).toEqual(1); // versification
            })
            .catch((err) => {
                expect(err.status).toEqual(400);
            });
    });

    it('should abort catalog downloads when exception is thrown', function() {
        library.__queueResponse = {
            slug: 'langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = function() {
            throw new Error('Something bad happened');
        };

        return client.updateCatalogs()
            .then(() => {
                expect(false).toBeTruthy();
            })
            .catch((err) => {
                expect(err instanceof Error);
                expect(library.addTargetLanguage.mock.calls.length).toEqual(0);
                expect(library.setApprovedTargetLanguage.mock.calls.length).toEqual(0);
                expect(library.addQuestionnaire.mock.calls.length).toEqual(0);
                expect(library.addQuestion.mock.calls.length).toEqual(0);
                expect(request.read.mock.calls.length).toEqual(1);
            });
    });

    it('should not abort catalog downloads when 404 is received', function() {
        // langs
        library.__queueResponse = {
            slug: 'langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 404;
        request.__queueResponse = JSON.stringify([]);

        // temp langs
        library.__queueResponse = {
            slug: 'temp-langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 404;
        request.__queueResponse = JSON.stringify([]);

        // approved langs
        library.__queueResponse = {
            slug: 'approved-temp-langnames',
            url: 'some/url'
        };
        request.__queueStatusCode = 404;
        request.__queueResponse = JSON.stringify([]);

        // lang questions
        library.__queueResponse = {
            slug: 'new-language-questions',
            url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify(
            {
                languages: [{
                    questions:[
                        {
                            depends_on: null,
                            id: 0,
                            sort: 1,
                            help: "",
                            required: true,
                            input_type: "string",
                            text: "What do you call your language?"
                        },
                        {
                            depends_on: 0,
                            id: 1,
                            sort: 2,
                            help: "",
                            required: false,
                            input_type: "string",
                            text: "Does that have a special meaning?"
                        }
                    ],
                    dir: "ltr",
                    slug: "en",
                    questionnaire_id: 1,
                    language_data: {
                        ln: 0,
                        cc: 4
                    },
                    name: "English"
                }]
            }
        );
        request.__setStatusCode = 400;

        return client.updateCatalogs()
            .then(() => {
                expect(library.addTargetLanguage.mock.calls.length).toEqual(0);
                expect(library.addTempTargetLanguage.mock.calls.length).toEqual(0);
                expect(library.setApprovedTargetLanguage.mock.calls.length).toEqual(0);
                expect(library.addQuestionnaire.mock.calls.length).toEqual(1);
                expect(library.addQuestion.mock.calls.length).toEqual(2);
            });
    });

    it('should abort catalog downloads at first exception', function() {
        library.__queueResponse = [{
            slug: 'langnames',
            chunks_url: 'some/url'
        },
            {
                slug: 'new-language-questions',
                chunks_url: 'some/url'
            }];
        library.__queueResponse = {
            slug: 'langnames',
            chunks_url: 'some/url'
        };
        library.__queueResponse = {
            slug: 'new-language-questions',
            chunks_url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = function() { throw new Error('error 1')};
        request.__queueStatusCode = 200;
        request.__queueResponse = function() { throw new Error('error 2')};
        request.__setStatusCode = 400;

        return client.updateCatalogs()
            .then(() => {
                expect(false).toBeTruthy();
            })
            .catch((err) => {
                expect(err instanceof Error).toEqual(true);
                expect(err.message).toEqual('error 1');
                expect(library.addTargetLanguage.mock.calls.length).toEqual(0);
                expect(library.addQuestionnaire.mock.calls.length).toEqual(0);
                expect(library.addQuestion.mock.calls.length).toEqual(0);
            });
    });

    it('should abort halfway through catalog downloads when exception is thrown', function() {
        library.__queueResponse = [{
                slug: 'langnames',
                chunks_url: 'some/url'
            },
            {
                slug: 'new-language-questions',
                chunks_url: 'some/url'
            },
            {
                slug: 'temp-langnames',
                chunks_url: 'some/url'
            }];
        library.__queueResponse = {
            slug: 'langnames',
            chunks_url: 'some/url'
        };
        library.__queueResponse = {
            slug: 'new-language-questions',
            chunks_url: 'some/url'
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {
                ang: "Afar",
                pk: 6,
                lr: "Africa",
                ln: "Afaraf",
                cc: [
                    "DJ",
                    "ER",
                    "ET",
                    "US",
                    "CA"
                ],
                ld: "ltr",
                gw: false,
                lc: "aa",
                alt: [
                    "Afaraf",
                    "Danakil",
                    "Denkel",
                    "Adal",
                    "Afar Af",
                    "Qafar",
                    "Baadu (Ba'adu)"
                ]
            },
            {
                ang: "Ghotuo",
                pk: 7,
                lr: "Africa",
                ln: "Ghotuo",
                cc: [
                    "NG"
                ],
                ld: "ltr",
                gw: false,
                lc: "aaa",
                alt: [ ]
            }
        ]);
        request.__queueStatusCode = 200;
        request.__queueResponse = function() {
            throw new Error('Something bad happened');
        };
        request.__queueStatusCode = 200;
        request.__queueResponse = JSON.stringify([
            {
                chp: "01",
                firstvs: "01"
            },
            {
                chp: "01",
                firstvs: "03"
            },
            {
                chp: "01",
                firstvs: "06"
            },
            {
                chp: "01",
                firstvs: "09"
            }
        ]);
        request.__setStatusCode = 400;

        return client.updateCatalogs()
            .then(() => {
                expect(false).toBeTruthy();
            })
            .catch((err) => {
                expect(err instanceof Error);
                expect(library.addTargetLanguage.mock.calls.length).toEqual(2);
                expect(library.addQuestionnaire.mock.calls.length).toEqual(0);
                expect(library.addQuestion.mock.calls.length).toEqual(0);
            });
    });
});
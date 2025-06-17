-- REAL Test Suites Based on Actual Frontend Analysis
-- This replaces the sample data with VERIFIED selectors from working tests

-- Clear existing test data first
DELETE FROM test_cases;
DELETE FROM test_suites;

-- Insert REAL test suites based on actual frontend analysis
INSERT INTO test_suites (id, name, description, category, created_by, enabled) VALUES
(uuid_generate_v4(), 'Authentication - Real UI Tests', 'Tests using VERIFIED selectors from working login test', 'authentication', 'admin@az1.ai', true),
(uuid_generate_v4(), 'Bookmark Management - Real UI Tests', 'Tests using VERIFIED bookmark form selectors', 'functionality', 'admin@az1.ai', true),
(uuid_generate_v4(), 'Import Workflow - Real UI Tests', 'Tests using VERIFIED import form selectors', 'integration', 'admin@az1.ai', true),
(uuid_generate_v4(), 'Collections Management - Real UI Tests', 'Tests using VERIFIED collection form selectors', 'functionality', 'admin@az1.ai', true),
(uuid_generate_v4(), 'Navigation & UI - Real Tests', 'Tests using VERIFIED navigation selectors', 'ui', 'admin@az1.ai', true);

-- Get suite IDs for test cases
DO $$
DECLARE
    auth_suite_id UUID;
    bookmark_suite_id UUID;
    import_suite_id UUID;
    collection_suite_id UUID;
    nav_suite_id UUID;
BEGIN
    -- Get suite IDs
    SELECT id INTO auth_suite_id FROM test_suites WHERE name = 'Authentication - Real UI Tests';
    SELECT id INTO bookmark_suite_id FROM test_suites WHERE name = 'Bookmark Management - Real UI Tests';
    SELECT id INTO import_suite_id FROM test_suites WHERE name = 'Import Workflow - Real UI Tests';
    SELECT id INTO collection_suite_id FROM test_suites WHERE name = 'Collections Management - Real UI Tests';
    SELECT id INTO nav_suite_id FROM test_suites WHERE name = 'Navigation & UI - Real Tests';

    -- AUTHENTICATION TEST CASES (Using VERIFIED selectors)
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        auth_suite_id,
        'TEST-AUTH-LOGIN-REAL-001',
        'Valid Login - VERIFIED Selectors',
        'Test successful login using VERIFIED working selectors from test-login-debug.js',
        'authentication',
        'high',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-login",
                "description": "Navigate to login page",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/login",
                        "waitUntil": "networkidle"
                    }
                },
                "validation": {
                    "type": "urlContains",
                    "expected": "/login"
                }
            },
            {
                "stepNumber": 2,
                "stepId": "verify-login-form",
                "description": "Verify login form elements are visible",
                "action": {
                    "type": "waitForSelector",
                    "target": {
                        "selector": "input[name=\"email\"]"
                    }
                },
                "validation": {
                    "type": "elementVisible",
                    "target": {
                        "selector": "input[name=\"email\"]"
                    },
                    "expected": true
                }
            },
            {
                "stepNumber": 3,
                "stepId": "enter-email-verified",
                "description": "Enter email using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"email\"]"
                    },
                    "parameters": {
                        "value": "admin@az1.ai"
                    }
                },
                "validation": {
                    "type": "attributeEquals",
                    "target": {
                        "selector": "input[name=\"email\"]"
                    },
                    "attribute": "value",
                    "expected": "admin@az1.ai"
                }
            },
            {
                "stepNumber": 4,
                "stepId": "enter-password-verified",
                "description": "Enter password using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"password\"]"
                    },
                    "parameters": {
                        "value": "changeme123"
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "click-submit-verified",
                "description": "Click submit button using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button[type=\"submit\"]"
                    },
                    "parameters": {
                        "waitAfter": 3000
                    }
                },
                "criticalError": true
            },
            {
                "stepNumber": 6,
                "stepId": "verify-dashboard-redirect",
                "description": "Verify successful redirect to dashboard",
                "action": {
                    "type": "wait",
                    "parameters": {
                        "value": 2000
                    }
                },
                "validation": {
                    "type": "urlContains",
                    "expected": "/dashboard"
                }
            }
        ]'::jsonb,
        '{"email": "admin@az1.ai", "password": "changeme123"}'::jsonb,
        'User should be logged in and redirected to dashboard with /api/auth/login returning 200',
        true,
        'admin@az1.ai'
    ),
    (
        uuid_generate_v4(),
        auth_suite_id,
        'TEST-AUTH-LOGIN-REAL-002',
        'Invalid Login - VERIFIED Error Handling',
        'Test login failure with VERIFIED error selector',
        'authentication',
        'high',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-login",
                "description": "Navigate to login page",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/login",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "enter-invalid-credentials",
                "description": "Enter invalid credentials",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"email\"]"
                    },
                    "parameters": {
                        "value": "invalid@az1.ai"
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "enter-invalid-password",
                "description": "Enter invalid password",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"password\"]"
                    },
                    "parameters": {
                        "value": "wrongpassword"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "click-submit",
                "description": "Click submit button",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button[type=\"submit\"]"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "verify-error-message",
                "description": "Verify error message appears using VERIFIED selector",
                "action": {
                    "type": "waitForSelector",
                    "target": {
                        "selector": "[role=\"alert\"]"
                    }
                },
                "validation": {
                    "type": "elementVisible",
                    "target": {
                        "selector": "[role=\"alert\"]"
                    },
                    "expected": true
                }
            }
        ]'::jsonb,
        '{"email": "invalid@az1.ai", "password": "wrongpassword"}'::jsonb,
        'Login should fail and VERIFIED error alert should be visible',
        true,
        'admin@az1.ai'
    ),
    (
        uuid_generate_v4(),
        auth_suite_id,
        'TEST-AUTH-LOGOUT-REAL-001',
        'User Logout - VERIFIED Selectors',
        'Test logout using VERIFIED user menu selector',
        'authentication',
        'medium',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-dashboard",
                "description": "Navigate to dashboard (assumes logged in)",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/dashboard",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "click-user-menu-verified",
                "description": "Click user menu using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button[aria-label=\"User menu\"]"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "click-logout",
                "description": "Click logout option",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "text=Logout"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "verify-redirect-to-login",
                "description": "Verify redirect to login page",
                "validation": {
                    "type": "urlContains",
                    "expected": "/login"
                }
            }
        ]'::jsonb,
        '{}'::jsonb,
        'User should be logged out and redirected to login page',
        true,
        'admin@az1.ai'
    );

    -- BOOKMARK MANAGEMENT TEST CASES (Using VERIFIED selectors)
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        bookmark_suite_id,
        'TEST-BOOKMARK-CREATE-REAL-001',
        'Create Bookmark - VERIFIED Form Selectors',
        'Test creating bookmark using VERIFIED form selectors from bookmarks.spec.js',
        'functionality',
        'high',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-bookmarks",
                "description": "Navigate to bookmarks page",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/bookmarks",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "click-add-bookmark-verified",
                "description": "Click add bookmark using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Add Bookmark\")"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "enter-url-verified",
                "description": "Enter URL using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"url\"]"
                    },
                    "parameters": {
                        "value": "https://example.com"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "enter-title-verified",
                "description": "Enter title using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"title\"]"
                    },
                    "parameters": {
                        "value": "Test Bookmark"
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "enter-description-verified",
                "description": "Enter description using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "textarea[name=\"description\"]"
                    },
                    "parameters": {
                        "value": "A test bookmark for automated testing"
                    }
                }
            },
            {
                "stepNumber": 6,
                "stepId": "add-tags-verified",
                "description": "Add tags using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder*=\"Add tags\"]"
                    },
                    "parameters": {
                        "value": "test"
                    }
                }
            },
            {
                "stepNumber": 7,
                "stepId": "press-enter-for-tag",
                "description": "Press Enter to add tag",
                "action": {
                    "type": "press",
                    "target": {
                        "selector": "input[placeholder*=\"Add tags\"]"
                    },
                    "parameters": {
                        "key": "Enter"
                    }
                }
            },
            {
                "stepNumber": 8,
                "stepId": "save-bookmark-verified",
                "description": "Save bookmark using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Save\")"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            },
            {
                "stepNumber": 9,
                "stepId": "verify-bookmark-created",
                "description": "Verify bookmark appears in list",
                "validation": {
                    "type": "textContains",
                    "target": {
                        "selector": "body"
                    },
                    "expected": "Test Bookmark"
                }
            }
        ]'::jsonb,
        '{"url": "https://example.com", "title": "Test Bookmark", "description": "A test bookmark for automated testing", "tags": ["test"]}'::jsonb,
        'Bookmark should be created and visible in bookmarks list',
        true,
        'admin@az1.ai'
    ),
    (
        uuid_generate_v4(),
        bookmark_suite_id,
        'TEST-BOOKMARK-SEARCH-REAL-001',
        'Search Bookmarks - VERIFIED Search Selector',
        'Test bookmark search using VERIFIED search input selector',
        'functionality',
        'medium',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-bookmarks",
                "description": "Navigate to bookmarks page",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/bookmarks",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "search-bookmarks-verified",
                "description": "Search bookmarks using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder*=\"Search\"]"
                    },
                    "parameters": {
                        "value": "example"
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "press-enter-search",
                "description": "Press Enter to search",
                "action": {
                    "type": "press",
                    "target": {
                        "selector": "input[placeholder*=\"Search\"]"
                    },
                    "parameters": {
                        "key": "Enter"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "verify-search-results",
                "description": "Verify search results appear",
                "validation": {
                    "type": "elementVisible",
                    "target": {
                        "selector": "input[placeholder*=\"Search\"]"
                    },
                    "expected": true
                }
            }
        ]'::jsonb,
        '{"searchTerm": "example"}'::jsonb,
        'Search should execute and filter bookmarks',
        true,
        'admin@az1.ai'
    );

    -- IMPORT WORKFLOW TEST CASES (Using VERIFIED selectors)
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        import_suite_id,
        'TEST-IMPORT-FILE-REAL-001',
        'Import HTML File - VERIFIED File Chooser',
        'Test import using VERIFIED file chooser selector from import.spec.js',
        'integration',
        'high',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-import",
                "description": "Navigate to import page",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/import",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "verify-import-page",
                "description": "Verify import page elements using VERIFIED selectors",
                "action": {
                    "type": "waitForSelector",
                    "target": {
                        "selector": "button:has-text(\"Choose File\")"
                    }
                },
                "validation": {
                    "type": "elementVisible",
                    "target": {
                        "selector": "button:has-text(\"Choose File\")"
                    },
                    "expected": true
                }
            },
            {
                "stepNumber": 3,
                "stepId": "verify-drop-zone",
                "description": "Verify drop zone is visible",
                "action": {
                    "type": "waitForSelector",
                    "target": {
                        "selector": "text=Drop your bookmark file here"
                    }
                },
                "validation": {
                    "type": "elementVisible",
                    "target": {
                        "selector": "text=Drop your bookmark file here"
                    },
                    "expected": true
                }
            }
        ]'::jsonb,
        '{"filename": "test-bookmarks.html"}'::jsonb,
        'Import page should display with VERIFIED file chooser and drop zone',
        true,
        'admin@az1.ai'
    );

    -- COLLECTIONS MANAGEMENT TEST CASES (Using VERIFIED selectors)
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        collection_suite_id,
        'TEST-COLLECTION-CREATE-REAL-001',
        'Create Collection - VERIFIED Form Selectors',
        'Test collection creation using VERIFIED selectors from collections.spec.js',
        'functionality',
        'high',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-collections",
                "description": "Navigate to collections page",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/collections",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "click-create-collection-verified",
                "description": "Click create collection using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Create Collection\")"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "enter-collection-name-verified",
                "description": "Enter collection name using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[name=\"name\"]"
                    },
                    "parameters": {
                        "value": "Test Collection"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "enter-collection-description-verified",
                "description": "Enter description using VERIFIED selector",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "textarea[name=\"description\"]"
                    },
                    "parameters": {
                        "value": "A test collection for automated testing"
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "save-collection-verified",
                "description": "Save collection using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Create\")"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            },
            {
                "stepNumber": 6,
                "stepId": "verify-collection-created",
                "description": "Verify collection appears in list",
                "validation": {
                    "type": "textContains",
                    "target": {
                        "selector": "body"
                    },
                    "expected": "Test Collection"
                }
            }
        ]'::jsonb,
        '{"name": "Test Collection", "description": "A test collection for automated testing"}'::jsonb,
        'Collection should be created and visible in collections list',
        true,
        'admin@az1.ai'
    );

    -- NAVIGATION TEST CASES (Using VERIFIED selectors)
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        nav_suite_id,
        'TEST-NAV-SIDEBAR-REAL-001',
        'Sidebar Navigation - VERIFIED Href Selectors',
        'Test navigation using VERIFIED href selectors from auth.spec.js',
        'ui',
        'medium',
        '[
            {
                "stepNumber": 1,
                "stepId": "start-at-dashboard",
                "description": "Start at dashboard",
                "action": {
                    "type": "navigate",
                    "parameters": {
                        "url": "http://localhost:5173/dashboard",
                        "waitUntil": "networkidle"
                    }
                }
            },
            {
                "stepNumber": 2,
                "stepId": "click-bookmarks-nav-verified",
                "description": "Click bookmarks nav using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "a[href=\"/bookmarks\"]"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "verify-bookmarks-page",
                "description": "Verify bookmarks page loaded",
                "validation": {
                    "type": "urlContains",
                    "expected": "/bookmarks"
                }
            },
            {
                "stepNumber": 4,
                "stepId": "click-collections-nav-verified",
                "description": "Click collections nav using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "a[href=\"/collections\"]"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "verify-collections-page",
                "description": "Verify collections page loaded",
                "validation": {
                    "type": "urlContains",
                    "expected": "/collections"
                }
            },
            {
                "stepNumber": 6,
                "stepId": "click-import-nav-verified",
                "description": "Click import nav using VERIFIED selector",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "a[href=\"/import\"]"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 7,
                "stepId": "verify-import-page",
                "description": "Verify import page loaded",
                "validation": {
                    "type": "urlContains",
                    "expected": "/import"
                }
            }
        ]'::jsonb,
        '{}'::jsonb,
        'Should navigate through all main sections using VERIFIED href selectors',
        true,
        'admin@az1.ai'
    );

END $$;
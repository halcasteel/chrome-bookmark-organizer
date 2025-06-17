-- Sample Test Data for Test Management Framework
-- This populates the database with example test suites and test cases

-- Insert sample test suites
INSERT INTO test_suites (id, name, description, category, created_by, enabled) VALUES
(uuid_generate_v4(), 'Authentication Test Suite', 'Comprehensive testing of user authentication flows', 'authentication', 'admin@az1.ai', true),
(uuid_generate_v4(), 'Bookmark Management Suite', 'Test bookmark CRUD operations and management features', 'functionality', 'admin@az1.ai', true),
(uuid_generate_v4(), 'Import Workflow Suite', 'Test bookmark import functionality and error handling', 'integration', 'admin@az1.ai', true),
(uuid_generate_v4(), 'UI/UX Navigation Suite', 'Test user interface navigation and responsiveness', 'ui', 'admin@az1.ai', true);

-- Get suite IDs for test cases (we'll use the first suite for detailed examples)
DO $$
DECLARE
    auth_suite_id UUID;
    bookmark_suite_id UUID;
    import_suite_id UUID;
    ui_suite_id UUID;
BEGIN
    -- Get suite IDs
    SELECT id INTO auth_suite_id FROM test_suites WHERE name = 'Authentication Test Suite';
    SELECT id INTO bookmark_suite_id FROM test_suites WHERE name = 'Bookmark Management Suite';
    SELECT id INTO import_suite_id FROM test_suites WHERE name = 'Import Workflow Suite';
    SELECT id INTO ui_suite_id FROM test_suites WHERE name = 'UI/UX Navigation Suite';

    -- Authentication Test Cases
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        auth_suite_id,
        'TEST-AUTH-LOGIN-001',
        'Valid User Login',
        'Test successful login with valid credentials',
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
                "stepId": "enter-email",
                "description": "Enter email address",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder*=\"@az1.ai\"]"
                    },
                    "parameters": {
                        "value": "admin@az1.ai"
                    }
                },
                "validation": {
                    "type": "attributeEquals",
                    "target": {
                        "selector": "input[placeholder*=\"@az1.ai\"]"
                    },
                    "expected": "admin@az1.ai"
                }
            },
            {
                "stepNumber": 3,
                "stepId": "enter-password",
                "description": "Enter password",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder=\"Enter your password\"]"
                    },
                    "parameters": {
                        "value": "changeme123"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "click-submit",
                "description": "Click login button",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Sign In\")"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                },
                "criticalError": true
            },
            {
                "stepNumber": 5,
                "stepId": "verify-dashboard",
                "description": "Verify successful login and redirect",
                "action": {
                    "type": "wait",
                    "parameters": {
                        "value": 1000
                    }
                },
                "validation": {
                    "type": "urlContains",
                    "expected": "/dashboard"
                }
            }
        ]'::jsonb,
        '{"email": "admin@az1.ai", "password": "changeme123"}'::jsonb,
        'User should be successfully logged in and redirected to dashboard',
        true,
        'admin@az1.ai'
    ),
    (
        uuid_generate_v4(),
        auth_suite_id,
        'TEST-AUTH-LOGIN-002',
        'Invalid Credentials Login',
        'Test login failure with invalid credentials',
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
                "stepId": "enter-invalid-email",
                "description": "Enter invalid email",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder*=\"@az1.ai\"]"
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
                        "selector": "input[placeholder=\"Enter your password\"]"
                    },
                    "parameters": {
                        "value": "wrongpassword"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "click-submit",
                "description": "Click login button",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Sign In\")"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "verify-error",
                "description": "Verify error message appears",
                "action": {
                    "type": "waitForSelector",
                    "target": {
                        "selector": "[role=\"alert\"], .error-message"
                    }
                },
                "validation": {
                    "type": "elementVisible",
                    "target": {
                        "selector": "[role=\"alert\"], .error-message"
                    },
                    "expected": true
                }
            }
        ]'::jsonb,
        '{"email": "invalid@az1.ai", "password": "wrongpassword"}'::jsonb,
        'Login should fail and error message should be displayed',
        true,
        'admin@az1.ai'
    ),
    (
        uuid_generate_v4(),
        auth_suite_id,
        'TEST-AUTH-LOGOUT-001',
        'User Logout',
        'Test user logout functionality',
        'authentication',
        'medium',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-dashboard",
                "description": "Navigate to dashboard (assuming logged in)",
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
                "stepId": "click-user-menu",
                "description": "Click user menu in header",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "[data-testid=\"user-menu\"], .user-avatar, .user-dropdown"
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
                        "selector": "button:has-text(\"Logout\"), [data-testid=\"logout-button\"]"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "verify-redirect",
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

    -- Bookmark Management Test Cases
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        bookmark_suite_id,
        'TEST-BOOKMARK-CREATE-001',
        'Create New Bookmark',
        'Test creating a new bookmark manually',
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
                "stepId": "click-add-bookmark",
                "description": "Click add bookmark button",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Add Bookmark\"), [data-testid=\"add-bookmark\"]"
                    }
                }
            },
            {
                "stepNumber": 3,
                "stepId": "enter-bookmark-url",
                "description": "Enter bookmark URL",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder*=\"URL\"], input[name=\"url\"]"
                    },
                    "parameters": {
                        "value": "https://example.com"
                    }
                }
            },
            {
                "stepNumber": 4,
                "stepId": "enter-bookmark-title",
                "description": "Enter bookmark title",
                "action": {
                    "type": "fill",
                    "target": {
                        "selector": "input[placeholder*=\"Title\"], input[name=\"title\"]"
                    },
                    "parameters": {
                        "value": "Test Bookmark"
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "save-bookmark",
                "description": "Save the bookmark",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "button:has-text(\"Save\"), [data-testid=\"save-bookmark\"]"
                    },
                    "parameters": {
                        "waitAfter": 2000
                    }
                }
            }
        ]'::jsonb,
        '{"url": "https://example.com", "title": "Test Bookmark"}'::jsonb,
        'Bookmark should be created and visible in the bookmarks list',
        true,
        'admin@az1.ai'
    );

    -- Import Workflow Test Cases
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        import_suite_id,
        'TEST-IMPORT-FILE-001',
        'Import HTML Bookmark File',
        'Test importing bookmarks from HTML file',
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
                "stepId": "select-file-input",
                "description": "Click file input to select file",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "input[type=\"file\"], [data-testid=\"file-input\"]"
                    }
                }
            }
        ]'::jsonb,
        '{"filename": "sample_bookmarks.html"}'::jsonb,
        'File should be selected and import process should start',
        true,
        'admin@az1.ai'
    );

    -- UI/UX Navigation Test Cases
    INSERT INTO test_cases (id, suite_id, test_identifier, name, description, category, priority, test_steps, test_data, expected_outcome, enabled, created_by) VALUES
    (
        uuid_generate_v4(),
        ui_suite_id,
        'TEST-NAV-SIDEBAR-001',
        'Sidebar Navigation',
        'Test navigation through all sidebar menu items',
        'ui',
        'medium',
        '[
            {
                "stepNumber": 1,
                "stepId": "navigate-to-dashboard",
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
                "stepId": "click-bookmarks-nav",
                "description": "Click bookmarks in sidebar",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "a[href=\"/bookmarks\"], nav a:has-text(\"Bookmarks\")"
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
                "stepId": "click-search-nav",
                "description": "Click search in sidebar",
                "action": {
                    "type": "click",
                    "target": {
                        "selector": "a[href=\"/search\"], nav a:has-text(\"Search\")"
                    },
                    "parameters": {
                        "waitAfter": 1000
                    }
                }
            },
            {
                "stepNumber": 5,
                "stepId": "verify-search-page",
                "description": "Verify search page loaded",
                "validation": {
                    "type": "urlContains",
                    "expected": "/search"
                }
            }
        ]'::jsonb,
        '{}'::jsonb,
        'Should be able to navigate to all main sections via sidebar',
        true,
        'admin@az1.ai'
    );

END $$;
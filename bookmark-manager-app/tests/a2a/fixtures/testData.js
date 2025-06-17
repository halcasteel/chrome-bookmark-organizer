/**
 * A2A Test Fixtures
 * Common test data for A2A architecture tests
 */

export const testBookmarks = {
  minimal: [
    {
      url: 'https://example.com',
      title: 'Example',
      tags: ['example'],
      dateAdded: new Date('2025-01-01')
    }
  ],
  
  standard: [
    {
      url: 'https://github.com',
      title: 'GitHub',
      description: 'Code hosting platform',
      tags: ['development', 'git'],
      folder: 'Development',
      dateAdded: new Date('2025-01-01'),
      icon: 'data:image/png;base64,github'
    },
    {
      url: 'https://stackoverflow.com',
      title: 'Stack Overflow',
      description: 'Q&A for developers',
      tags: ['development', 'help'],
      folder: 'Development',
      dateAdded: new Date('2025-01-02')
    },
    {
      url: 'https://nodejs.org',
      title: 'Node.js',
      description: 'JavaScript runtime',
      tags: ['javascript', 'runtime'],
      folder: 'Development/Tools',
      dateAdded: new Date('2025-01-03')
    },
    {
      url: 'https://react.dev',
      title: 'React',
      description: 'UI library',
      tags: ['javascript', 'frontend'],
      folder: 'Development/Frameworks',
      dateAdded: new Date('2025-01-04')
    },
    {
      url: 'https://news.ycombinator.com',
      title: 'Hacker News',
      description: 'Tech news',
      tags: ['news', 'tech'],
      folder: 'News',
      dateAdded: new Date('2025-01-05')
    }
  ],
  
  withInvalidURLs: [
    {
      url: 'https://valid.example.com',
      title: 'Valid URL',
      dateAdded: new Date()
    },
    {
      url: 'not-a-url',
      title: 'Invalid URL',
      dateAdded: new Date()
    },
    {
      url: '',
      title: 'Empty URL',
      dateAdded: new Date()
    },
    {
      url: 'javascript:alert(1)',
      title: 'XSS Attempt',
      dateAdded: new Date()
    },
    {
      url: 'file:///etc/passwd',
      title: 'File Protocol',
      dateAdded: new Date()
    }
  ],
  
  withSpecialCharacters: [
    {
      url: 'https://example.com/search?q=test&lang=en',
      title: 'URL with Query Params',
      dateAdded: new Date()
    },
    {
      url: 'https://example.com/path#section',
      title: 'URL with Fragment',
      dateAdded: new Date()
    },
    {
      url: 'https://example.com/unicode/漢字',
      title: 'Unicode in URL',
      dateAdded: new Date()
    },
    {
      url: 'https://example.com',
      title: 'Title with "Quotes" and \'Apostrophes\'',
      dateAdded: new Date()
    },
    {
      url: 'https://example.com',
      title: 'Title with <HTML> & Special &amp; Characters',
      tags: ['<script>', 'test&test'],
      dateAdded: new Date()
    }
  ]
};

export const testTasks = {
  pending: {
    id: 'test-task-pending',
    type: 'import',
    status: 'pending',
    context: {
      filePath: '/tmp/test-bookmarks.html',
      userId: 'test-user'
    },
    metadata: {
      testRun: true
    },
    createdAt: new Date()
  },
  
  running: {
    id: 'test-task-running',
    type: 'import',
    status: 'running',
    context: {
      filePath: '/tmp/test-bookmarks.html',
      userId: 'test-user'
    },
    metadata: {
      testRun: true
    },
    createdAt: new Date(),
    startedAt: new Date()
  },
  
  completed: {
    id: 'test-task-completed',
    type: 'import',
    status: 'completed',
    context: {
      filePath: '/tmp/test-bookmarks.html',
      userId: 'test-user'
    },
    metadata: {
      testRun: true
    },
    createdAt: new Date(Date.now() - 60000),
    startedAt: new Date(Date.now() - 60000),
    completedAt: new Date(),
    executionTime: 1234
  },
  
  failed: {
    id: 'test-task-failed',
    type: 'import',
    status: 'failed',
    context: {
      filePath: '/tmp/non-existent.html',
      userId: 'test-user'
    },
    metadata: {
      testRun: true
    },
    error: 'File not found',
    createdAt: new Date(Date.now() - 60000),
    startedAt: new Date(Date.now() - 60000),
    completedAt: new Date()
  }
};

export const testWorkflows = {
  simpleImport: {
    type: 'simple_import',
    agents: ['import']
  },
  
  fullImport: {
    type: 'full_import',
    agents: ['import', 'validation', 'enrichment', 'categorization']
  },
  
  validationOnly: {
    type: 'validation_only',
    agents: ['validation']
  },
  
  enrichmentPipeline: {
    type: 'enrichment_pipeline',
    agents: ['enrichment', 'categorization', 'embedding']
  }
};

export const testAgentConfigs = {
  import: {
    name: 'import',
    version: '1.0.0',
    description: 'Import bookmarks from files',
    capabilities: {
      inputs: {
        filePath: { type: 'string', required: true },
        userId: { type: 'string', required: true },
        importId: { type: 'string', required: false }
      },
      outputs: {
        type: 'bookmark_import_result',
        schema: {
          totalBookmarks: 'number',
          importedBookmarks: 'number',
          errors: 'array'
        }
      },
      actions: ['import']
    }
  },
  
  validation: {
    name: 'validation',
    version: '1.0.0',
    description: 'Validate bookmark URLs',
    capabilities: {
      inputs: {
        bookmarkId: { type: 'string', required: true },
        url: { type: 'string', required: true }
      },
      outputs: {
        type: 'validation_result',
        schema: {
          valid: 'boolean',
          statusCode: 'number',
          redirectUrl: 'string',
          error: 'string'
        }
      },
      actions: ['validate']
    }
  },
  
  enrichment: {
    name: 'enrichment',
    version: '1.0.0',
    description: 'Enrich bookmarks with metadata',
    capabilities: {
      inputs: {
        bookmarkId: { type: 'string', required: true },
        url: { type: 'string', required: true }
      },
      outputs: {
        type: 'enrichment_result',
        schema: {
          title: 'string',
          description: 'string',
          keywords: 'array',
          ogImage: 'string'
        }
      },
      actions: ['enrich']
    }
  }
};

export const testHTMLFiles = {
  minimal: `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1735689600">Example</A>
</DL><p>`,

  withFolders: `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Development</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1735689600" TAGS="dev,git">GitHub</A>
        <DD>Code hosting platform
        <DT><A HREF="https://stackoverflow.com" ADD_DATE="1735776000">Stack Overflow</A>
    </DL><p>
    <DT><H3>News</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1735862400">Hacker News</A>
    </DL><p>
</DL><p>`,

  malformed: `<html>
<body>
This is not a valid bookmarks file
<a href="https://example.com">Example</a>
</body>
</html>`
};

export const testJSONFiles = {
  minimal: {
    version: '1.0',
    bookmarks: [
      {
        url: 'https://example.com',
        title: 'Example',
        dateAdded: '2025-01-01T00:00:00Z'
      }
    ]
  },
  
  complete: {
    version: '1.0',
    metadata: {
      exportDate: '2025-01-15T00:00:00Z',
      bookmarkCount: 3
    },
    bookmarks: [
      {
        url: 'https://github.com',
        title: 'GitHub',
        description: 'Code hosting platform',
        tags: ['development', 'git'],
        folder: 'Development',
        dateAdded: '2025-01-01T00:00:00Z',
        icon: 'data:image/png;base64,github'
      },
      {
        url: 'https://stackoverflow.com',
        title: 'Stack Overflow',
        description: 'Q&A for developers',
        tags: ['development', 'help'],
        folder: 'Development',
        dateAdded: '2025-01-02T00:00:00Z'
      },
      {
        url: 'https://news.ycombinator.com',
        title: 'Hacker News',
        tags: ['news', 'tech'],
        folder: 'News',
        dateAdded: '2025-01-05T00:00:00Z'
      }
    ]
  },
  
  invalid: {
    notBookmarks: 'This is not a valid format'
  }
};

export const testUsers = {
  admin: {
    id: 'test-admin-id',
    email: 'admin@test.com',
    username: 'testadmin',
    role: 'admin'
  },
  
  regular: {
    id: 'test-user-id',
    email: 'user@test.com',
    username: 'testuser',
    role: 'user'
  }
};

export const expectedArtifacts = {
  importResult: {
    type: 'bookmark_import_result',
    schema: {
      totalBookmarks: 'number',
      importedBookmarks: 'number',
      duplicates: 'number',
      errors: 'object',
      fileType: 'string',
      processingTime: 'number'
    }
  },
  
  validationResult: {
    type: 'validation_result',
    schema: {
      valid: 'boolean',
      statusCode: 'number',
      redirectUrl: 'string',
      error: 'string',
      screenshot: 'string'
    }
  },
  
  enrichmentResult: {
    type: 'enrichment_result',
    schema: {
      title: 'string',
      description: 'string',
      keywords: 'object',
      ogImage: 'string',
      favicon: 'string',
      language: 'string'
    }
  }
};

export const mockResponses = {
  healthyWebsite: {
    status: 200,
    headers: {
      'content-type': 'text/html'
    },
    body: `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <meta name="description" content="A test page for validation">
  <meta property="og:image" content="https://example.com/image.jpg">
</head>
<body>
  <h1>Test Page</h1>
</body>
</html>`
  },
  
  redirect: {
    status: 301,
    headers: {
      'location': 'https://example.com/new-url'
    }
  },
  
  notFound: {
    status: 404,
    body: 'Not Found'
  },
  
  serverError: {
    status: 500,
    body: 'Internal Server Error'
  }
};
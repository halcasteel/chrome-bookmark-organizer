export const testData = {
  admin: {
    email: 'admin@az1.ai',
    password: 'changeme123',
    role: 'admin',
    name: 'Admin User'
  },
  
  bookmarks: {
    valid: {
      url: 'https://example.com',
      title: 'Example Website',
      description: 'A test bookmark for automated testing',
      tags: ['test', 'example'],
    },
    google: {
      url: 'https://www.google.com',
      title: 'Google',
      description: 'Search engine',
      tags: ['search', 'google'],
    },
    github: {
      url: 'https://github.com',
      title: 'GitHub',
      description: 'Code hosting platform',
      tags: ['development', 'git'],
    }
  },

  collections: {
    work: {
      name: 'Work Resources',
      description: 'Bookmarks for work-related sites',
      color: '#3182ce',
    },
    personal: {
      name: 'Personal',
      description: 'Personal bookmarks',
      color: '#48bb78',
    }
  },

  tags: {
    development: {
      name: 'development',
      color: '#9f7aea',
    },
    learning: {
      name: 'learning',
      color: '#ed8936',
    }
  },

  sampleBookmarkFile: `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1625097600" LAST_MODIFIED="1625097600">Test Folder</H3>
    <DL><p>
        <DT><A HREF="https://playwright.dev" ADD_DATE="1625097600">Playwright</A>
        <DT><A HREF="https://www.typescriptlang.org" ADD_DATE="1625097600">TypeScript</A>
        <DT><A HREF="https://react.dev" ADD_DATE="1625097600">React</A>
    </DL><p>
    <DT><A HREF="https://nodejs.org" ADD_DATE="1625097600">Node.js</A>
    <DT><A HREF="https://www.postgresql.org" ADD_DATE="1625097600">PostgreSQL</A>
</DL><p>`
};
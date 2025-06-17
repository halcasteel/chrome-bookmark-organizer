#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Synthetic Data Generator
 * Creates realistic test data that mirrors production data patterns
 * All data is valid and functional, not fake or mocked
 */

class SyntheticDataGenerator {
  constructor() {
    this.domains = [
      'github.com',
      'stackoverflow.com',
      'medium.com',
      'dev.to',
      'hackernews.com',
      'reddit.com',
      'arxiv.org',
      'npmjs.com',
      'youtube.com',
      'twitter.com',
      'linkedin.com',
      'aws.amazon.com',
      'cloud.google.com',
      'docs.microsoft.com',
      'developer.mozilla.org'
    ];

    this.categories = [
      'Development',
      'Documentation', 
      'Tutorial',
      'Reference',
      'Tool',
      'Library',
      'Framework',
      'Article',
      'Video',
      'Course',
      'Repository',
      'Discussion',
      'News',
      'Resource',
      'Guide'
    ];

    this.tags = [
      'javascript', 'typescript', 'react', 'nodejs', 'python',
      'docker', 'kubernetes', 'aws', 'database', 'postgresql',
      'redis', 'api', 'rest', 'graphql', 'security',
      'performance', 'testing', 'devops', 'ci/cd', 'git',
      'machine-learning', 'ai', 'web-development', 'backend',
      'frontend', 'fullstack', 'microservices', 'architecture',
      'best-practices', 'tutorial', 'optimization', 'debugging'
    ];

    this.userRoles = ['user', 'admin', 'moderator'];
  }

  // Generate realistic users (matching actual schema)
  generateUsers(count = 10) {
    const users = [];
    const baseUsers = [
      { 
        email: 'admin@az1.ai', 
        name: 'Admin User',
        two_factor_enabled: true,
        two_factor_verified: true
      },
      { 
        email: 'test@az1.ai', 
        name: 'Test User',
        two_factor_enabled: false,
        two_factor_verified: false
      }
    ];

    // Add base users
    users.push(...baseUsers);

    // Generate additional users - all must have @az1.ai email
    for (let i = 1; i <= count - baseUsers.length; i++) {
      const firstName = this.getRandomFirstName();
      const lastName = this.getRandomLastName();
      
      users.push({
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@az1.ai`,
        name: `${firstName} ${lastName}`,
        two_factor_enabled: Math.random() > 0.7,
        two_factor_verified: Math.random() > 0.7,
        last_login: Math.random() > 0.5 ? this.getRandomPastDate(30) : null,
        created_at: this.getRandomPastDate(365)
      });
    }

    return users.map(user => ({
      id: crypto.randomUUID(),
      ...user,
      password_hash: bcrypt.hashSync('TestPass123!', 10),
      two_factor_secret: user.two_factor_enabled ? crypto.randomBytes(32).toString('base64') : null,
      recovery_codes: user.two_factor_enabled ? this.generateRecoveryCodes() : null,
      updated_at: user.created_at || new Date()
    }));
  }

  // Generate recovery codes for 2FA
  generateRecoveryCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }

  // Generate realistic bookmarks (matching actual schema)
  generateBookmarks(users, count = 100) {
    const bookmarks = [];
    const realUrls = this.getRealUrls();

    for (let i = 0; i < count; i++) {
      const url = this.getRandomElement(realUrls);
      const user = this.getRandomElement(users);
      const createdDate = this.getRandomPastDate(180);
      const urlObj = new URL(url.url);
      const isValid = Math.random() > 0.1; // 90% valid
      
      const bookmark = {
        id: crypto.randomUUID(),
        user_id: user.id,
        url: url.url,
        title: url.title,
        description: url.description,
        domain: urlObj.hostname,
        favicon_url: `https://${urlObj.hostname}/favicon.ico`,
        is_valid: isValid,
        last_checked: Math.random() > 0.3 ? this.getRandomPastDate(7) : null,
        http_status: isValid ? 200 : (Math.random() > 0.5 ? 404 : 500),
        content_hash: crypto.randomBytes(32).toString('hex'),
        created_at: createdDate,
        updated_at: createdDate,
        imported_at: Math.random() > 0.5 ? createdDate : null,
        chrome_add_date: Math.random() > 0.5 ? createdDate.getTime() : null,
        // Validation columns
        validation_errors: isValid ? [] : [{ code: 'URL_NOT_FOUND', message: 'Page not found' }],
        check_attempts: Math.floor(Math.random() * 3),
        enrichment_data: this.generateEnrichmentData(url),
        ai_tags: this.getRandomTags(2, 5),
        ai_summary: `${url.description} This resource provides valuable information about ${this.getRandomElement(this.categories).toLowerCase()}.`,
        screenshot_url: Math.random() > 0.7 ? `https://screenshot.service/capture/${encodeURIComponent(url.url)}` : null
      };

      bookmarks.push(bookmark);
    }

    return bookmarks;
  }

  // Generate enrichment data
  generateEnrichmentData(url) {
    return {
      language: 'en',
      readingTime: Math.floor(Math.random() * 600) + 60, // 1-10 minutes
      wordCount: Math.floor(Math.random() * 2000) + 200,
      lastModified: this.getRandomPastDate(30).toISOString(),
      contentType: 'text/html',
      author: Math.random() > 0.5 ? this.getRandomElement(['John Doe', 'Jane Smith', 'Tech Team', 'Documentation Team']) : null
    };
  }

  // Generate realistic collections
  generateCollections(users, bookmarks) {
    const collections = [];
    const collectionNames = [
      'Web Development Resources',
      'JavaScript Tutorials',
      'DevOps Tools',
      'API Documentation',
      'Learning Resources',
      'Project References',
      'Security Best Practices',
      'Performance Optimization',
      'Architecture Patterns',
      'Useful Libraries'
    ];

    users.forEach((user, index) => {
      // Each user gets 1-3 collections
      const numCollections = Math.floor(Math.random() * 3) + 1;
      const userBookmarks = bookmarks.filter(b => b.userId === user.id);
      
      for (let i = 0; i < numCollections && i < collectionNames.length; i++) {
        const collection = {
          id: crypto.randomUUID(),
          userId: user.id,
          name: collectionNames[index * 3 + i] || `${user.username}'s Collection ${i + 1}`,
          description: `A curated collection of ${this.getRandomElement(this.categories).toLowerCase()} resources`,
          isPublic: Math.random() > 0.5,
          createdAt: this.getRandomPastDate(90),
          bookmarkCount: 0,
          bookmarks: []
        };

        // Add 3-10 bookmarks to each collection
        const numBookmarks = Math.floor(Math.random() * 8) + 3;
        const selectedBookmarks = this.shuffleArray(userBookmarks).slice(0, numBookmarks);
        collection.bookmarks = selectedBookmarks.map(b => b.id);
        collection.bookmarkCount = selectedBookmarks.length;

        collections.push(collection);
      }
    });

    return collections;
  }

  // Generate realistic import history
  generateImportHistory(users) {
    const imports = [];
    const sources = ['chrome', 'firefox', 'safari', 'edge', 'bookmarks.html'];
    
    users.slice(0, 5).forEach(user => {
      const numImports = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < numImports; i++) {
        const importDate = this.getRandomPastDate(60);
        const bookmarkCount = Math.floor(Math.random() * 200) + 50;
        
        imports.push({
          id: crypto.randomUUID(),
          userId: user.id,
          source: this.getRandomElement(sources),
          status: 'completed',
          totalBookmarks: bookmarkCount,
          importedBookmarks: bookmarkCount - Math.floor(Math.random() * 10),
          duplicates: Math.floor(Math.random() * 20),
          errors: Math.floor(Math.random() * 3),
          startedAt: importDate,
          completedAt: new Date(importDate.getTime() + Math.random() * 300000), // 0-5 minutes later
          fileName: `${this.getRandomElement(sources)}_export_${importDate.getTime()}.html`
        });
      }
    });

    return imports;
  }

  // Helper: Get real URLs that actually exist
  getRealUrls() {
    return [
      {
        url: 'https://github.com/facebook/react',
        title: 'React - A JavaScript library for building user interfaces',
        description: 'React makes it painless to create interactive UIs. Design simple views for each state in your application.'
      },
      {
        url: 'https://nodejs.org/en/docs/',
        title: 'Node.js Documentation',
        description: 'Official Node.js documentation covering API references, guides, and resources.'
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        title: 'JavaScript | MDN',
        description: 'JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions.'
      },
      {
        url: 'https://stackoverflow.com/questions/tagged/javascript',
        title: 'JavaScript Questions - Stack Overflow',
        description: 'Questions tagged with javascript on Stack Overflow, the largest developer community.'
      },
      {
        url: 'https://www.postgresql.org/docs/',
        title: 'PostgreSQL Documentation',
        description: 'The official documentation for PostgreSQL, the world\'s most advanced open source database.'
      },
      {
        url: 'https://redis.io/docs/',
        title: 'Redis Documentation',
        description: 'Start with the Redis documentation to learn about Redis, the in-memory data structure store.'
      },
      {
        url: 'https://docs.docker.com/',
        title: 'Docker Documentation',
        description: 'Docker Documentation - Get started with Docker, containerization, and container orchestration.'
      },
      {
        url: 'https://kubernetes.io/docs/',
        title: 'Kubernetes Documentation',
        description: 'Kubernetes is an open-source system for automating deployment, scaling, and management of containerized applications.'
      },
      {
        url: 'https://expressjs.com/',
        title: 'Express - Node.js web application framework',
        description: 'Fast, unopinionated, minimalist web framework for Node.js'
      },
      {
        url: 'https://www.typescriptlang.org/docs/',
        title: 'TypeScript Documentation',
        description: 'TypeScript extends JavaScript by adding types to the language.'
      },
      {
        url: 'https://aws.amazon.com/documentation/',
        title: 'AWS Documentation',
        description: 'Find user guides, developer guides, API references, tutorials, and more.'
      },
      {
        url: 'https://jestjs.io/docs/getting-started',
        title: 'Getting Started · Jest',
        description: 'Jest is a delightful JavaScript Testing Framework with a focus on simplicity.'
      },
      {
        url: 'https://www.npmjs.com/package/axios',
        title: 'axios - npm',
        description: 'Promise based HTTP client for the browser and node.js'
      },
      {
        url: 'https://tailwindcss.com/docs',
        title: 'Tailwind CSS Documentation',
        description: 'A utility-first CSS framework packed with classes that can be composed to build any design.'
      },
      {
        url: 'https://nextjs.org/docs',
        title: 'Next.js Documentation',
        description: 'Learn how to use Next.js with interactive examples and API references.'
      }
    ];
  }

  // Helper: Get random element from array
  getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // Helper: Shuffle array
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Helper: Get random tags
  getRandomTags(min = 1, max = 5) {
    const count = Math.floor(Math.random() * (max - min + 1)) + min;
    return this.shuffleArray(this.tags).slice(0, count);
  }

  // Helper: Get random past date
  getRandomPastDate(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
    return date;
  }

  // Helper: Get random date after a given date
  getRandomDateAfter(startDate) {
    const daysSince = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
    const randomDays = Math.floor(Math.random() * daysSince);
    const date = new Date(startDate);
    date.setDate(date.getDate() + randomDays);
    return date;
  }

  // Helper: Get random first names
  getRandomFirstName() {
    const names = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Avery', 'Quinn', 'Sage'];
    return this.getRandomElement(names);
  }

  // Helper: Get random last names
  getRandomLastName() {
    const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
    return this.getRandomElement(names);
  }

  // Generate all test data
  generateAll() {
    console.log('🎨 Generating synthetic test data...\n');

    const users = this.generateUsers(10);
    console.log(`✅ Generated ${users.length} users`);

    const bookmarks = this.generateBookmarks(users, 150);
    console.log(`✅ Generated ${bookmarks.length} bookmarks`);

    const collections = this.generateCollections(users, bookmarks);
    console.log(`✅ Generated ${collections.length} collections`);

    const imports = this.generateImportHistory(users);
    console.log(`✅ Generated ${imports.length} import records`);

    const testData = {
      users,
      bookmarks,
      collections,
      imports,
      metadata: {
        generated: new Date().toISOString(),
        counts: {
          users: users.length,
          bookmarks: bookmarks.length,
          collections: collections.length,
          imports: imports.length
        }
      }
    };

    // Save to file
    const outputPath = path.join(__dirname, 'synthetic-test-data.json');
    fs.writeFileSync(outputPath, JSON.stringify(testData, null, 2));
    console.log(`\n✅ Saved test data to: ${outputPath}`);

    // Also save SQL insert statements
    this.generateSQLInserts(testData);

    return testData;
  }

  // Generate SQL insert statements
  generateSQLInserts(data) {
    let sql = '-- Synthetic Test Data SQL Inserts\n';
    sql += '-- Generated: ' + new Date().toISOString() + '\n';
    sql += '-- This creates REAL test data matching production schema\n\n';

    // Users
    sql += '-- Users (all with @az1.ai domain)\n';
    data.users.forEach(user => {
      sql += `INSERT INTO users (id, email, password_hash, name, two_factor_enabled, two_factor_secret, two_factor_verified, recovery_codes, last_login, created_at, updated_at) VALUES (\n`;
      sql += `  '${user.id}',\n`;
      sql += `  '${user.email}',\n`;
      sql += `  '${user.password_hash}',\n`;
      sql += `  ${user.name ? `'${user.name}'` : 'NULL'},\n`;
      sql += `  ${user.two_factor_enabled},\n`;
      sql += `  ${user.two_factor_secret ? `'${user.two_factor_secret}'` : 'NULL'},\n`;
      sql += `  ${user.two_factor_verified},\n`;
      sql += `  ${user.recovery_codes ? `'${JSON.stringify(user.recovery_codes)}'::jsonb` : 'NULL'},\n`;
      sql += `  ${user.last_login ? `'${user.last_login.toISOString()}'` : 'NULL'},\n`;
      sql += `  '${user.created_at.toISOString()}',\n`;
      sql += `  '${user.updated_at.toISOString()}'\n`;
      sql += `);\n\n`;
    });

    // Bookmarks
    sql += '-- Bookmarks with validation data\n';
    data.bookmarks.forEach(bookmark => {
      sql += `INSERT INTO bookmarks (id, user_id, url, title, description, domain, favicon_url, is_valid, last_checked, http_status, content_hash, created_at, updated_at, imported_at, chrome_add_date, validation_errors, check_attempts, enrichment_data, ai_tags, ai_summary, screenshot_url) VALUES (\n`;
      sql += `  '${bookmark.id}',\n`;
      sql += `  '${bookmark.user_id}',\n`;
      sql += `  '${bookmark.url.replace(/'/g, "''")}',\n`;
      sql += `  '${bookmark.title.replace(/'/g, "''")}',\n`;
      sql += `  ${bookmark.description ? `'${bookmark.description.replace(/'/g, "''")}'` : 'NULL'},\n`;
      sql += `  '${bookmark.domain}',\n`;
      sql += `  ${bookmark.favicon_url ? `'${bookmark.favicon_url}'` : 'NULL'},\n`;
      sql += `  ${bookmark.is_valid},\n`;
      sql += `  ${bookmark.last_checked ? `'${bookmark.last_checked.toISOString()}'` : 'NULL'},\n`;
      sql += `  ${bookmark.http_status || 'NULL'},\n`;
      sql += `  '${bookmark.content_hash}',\n`;
      sql += `  '${bookmark.created_at.toISOString()}',\n`;
      sql += `  '${bookmark.updated_at.toISOString()}',\n`;
      sql += `  ${bookmark.imported_at ? `'${bookmark.imported_at.toISOString()}'` : 'NULL'},\n`;
      sql += `  ${bookmark.chrome_add_date || 'NULL'},\n`;
      sql += `  '${JSON.stringify(bookmark.validation_errors)}'::jsonb,\n`;
      sql += `  ${bookmark.check_attempts},\n`;
      sql += `  '${JSON.stringify(bookmark.enrichment_data)}'::jsonb,\n`;
      sql += `  ARRAY[${bookmark.ai_tags.map(tag => `'${tag}'`).join(', ')}],\n`;
      sql += `  ${bookmark.ai_summary ? `'${bookmark.ai_summary.replace(/'/g, "''")}'` : 'NULL'},\n`;
      sql += `  ${bookmark.screenshot_url ? `'${bookmark.screenshot_url}'` : 'NULL'}\n`;
      sql += `);\n\n`;
    });

    // Tags
    sql += '-- Tags\n';
    const uniqueTags = new Set();
    data.bookmarks.forEach(bookmark => {
      bookmark.ai_tags.forEach(tag => {
        uniqueTags.add(`${bookmark.user_id}:${tag}`);
      });
    });

    uniqueTags.forEach(tagKey => {
      const [userId, tagName] = tagKey.split(':');
      sql += `INSERT INTO tags (id, user_id, name, color, created_at) VALUES (\n`;
      sql += `  '${crypto.randomUUID()}',\n`;
      sql += `  '${userId}',\n`;
      sql += `  '${tagName}',\n`;
      sql += `  '#${Math.floor(Math.random()*16777215).toString(16)}',\n`;
      sql += `  NOW()\n`;
      sql += `) ON CONFLICT (user_id, name) DO NOTHING;\n\n`;
    });

    // Collections
    sql += '-- Collections\n';
    data.collections.forEach(collection => {
      sql += `INSERT INTO collections (id, user_id, name, description, is_public, share_token, created_at, updated_at) VALUES (\n`;
      sql += `  '${collection.id}',\n`;
      sql += `  '${collection.userId}',\n`;
      sql += `  '${collection.name.replace(/'/g, "''")}',\n`;
      sql += `  ${collection.description ? `'${collection.description.replace(/'/g, "''")}'` : 'NULL'},\n`;
      sql += `  ${collection.isPublic},\n`;
      sql += `  ${collection.isPublic ? `'${crypto.randomBytes(16).toString('hex')}'` : 'NULL'},\n`;
      sql += `  '${collection.createdAt.toISOString()}',\n`;
      sql += `  '${collection.createdAt.toISOString()}'\n`;
      sql += `);\n\n`;
    });

    // Import history
    sql += '-- Import History\n';
    data.imports.forEach(imp => {
      sql += `INSERT INTO import_history (id, user_id, filename, file_size, total_bookmarks, new_bookmarks, updated_bookmarks, failed_bookmarks, status, started_at, completed_at, total_invalid, total_enriched) VALUES (\n`;
      sql += `  '${imp.id}',\n`;
      sql += `  '${imp.userId}',\n`;
      sql += `  '${imp.fileName}',\n`;
      sql += `  ${Math.floor(Math.random() * 1000000) + 10000},\n`;
      sql += `  ${imp.totalBookmarks},\n`;
      sql += `  ${imp.importedBookmarks},\n`;
      sql += `  ${imp.duplicates},\n`;
      sql += `  ${imp.errors},\n`;
      sql += `  '${imp.status}',\n`;
      sql += `  '${imp.startedAt.toISOString()}',\n`;
      sql += `  '${imp.completedAt.toISOString()}',\n`;
      sql += `  ${imp.errors},\n`;
      sql += `  ${imp.importedBookmarks - imp.errors}\n`;
      sql += `);\n\n`;
    });

    // Save SQL file
    const sqlPath = path.join(__dirname, 'synthetic-test-data.sql');
    fs.writeFileSync(sqlPath, sql);
    console.log(`✅ Saved SQL inserts to: ${sqlPath}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new SyntheticDataGenerator();
  generator.generateAll();
}

export default SyntheticDataGenerator;
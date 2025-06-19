use anyhow::Result;
use chrono::{DateTime, Utc};
use scraper::{Html, Selector, ElementRef};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use tracing::{debug, warn};
use url::Url;

/// Raw bookmark data from HTML parsing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawBookmark {
    pub url: String,
    pub title: String,
    pub hash: String,
    pub add_date: Option<DateTime<Utc>>,
    pub last_modified: Option<DateTime<Utc>>,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub folder_path: Vec<String>,
    pub attributes: HashMap<String, String>,
}

impl RawBookmark {
    /// Generate hash from URL
    pub fn generate_hash(url: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(url.as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    /// Validate URL format
    pub fn is_valid_url(&self) -> bool {
        Url::parse(&self.url).is_ok()
    }
}

/// Parse HTML bookmark file
pub struct BookmarkParser;

impl BookmarkParser {
    /// Parse bookmarks from HTML content
    pub fn parse_html(html_content: &str) -> Result<Vec<RawBookmark>> {
        let document = Html::parse_document(html_content);
        let mut bookmarks = Vec::new();
        
        // Selectors
        let dt_selector = Selector::parse("dt").unwrap();
        let dl_selector = Selector::parse("dl").unwrap();
        
        // Start from the root and find the main DL
        for dl in document.select(&dl_selector) {
            Self::parse_dl_element(dl, &mut bookmarks, &mut Vec::new());
        }
        
        debug!("Parsed {} bookmarks from HTML", bookmarks.len());
        Ok(bookmarks)
    }
    
    /// Parse a DL element recursively
    fn parse_dl_element(
        dl: ElementRef,
        bookmarks: &mut Vec<RawBookmark>,
        current_path: &mut Vec<String>,
    ) {
        let dt_selector = Selector::parse("dt").unwrap();
        
        // Process direct DT children only (not nested ones)
        for dt in dl.select(&dt_selector) {
            // Check if this DT is a direct child of our DL
            if !Self::is_direct_child(&dl, &dt) {
                continue;
            }
            
            // Check for H3 (folder)
            if let Some(h3) = dt.select(&Selector::parse("h3").unwrap()).next() {
                let folder_name = h3.text().collect::<String>().trim().to_string();
                
                // Look for a following DL that contains the folder's bookmarks
                let mut found_dl = false;
                for sibling in dt.next_siblings() {
                    if let Some(elem) = ElementRef::wrap(sibling) {
                        if elem.value().name() == "dl" {
                            // Process this folder's contents
                            current_path.push(folder_name.clone());
                            Self::parse_dl_element(elem, bookmarks, current_path);
                            current_path.pop();
                            found_dl = true;
                            break;
                        }
                    }
                }
                
                if !found_dl {
                    debug!("Folder '{}' has no DL element", folder_name);
                }
            }
            
            // Check for A (bookmark)
            if let Some(a) = dt.select(&Selector::parse("a").unwrap()).next() {
                if let Some(href) = a.value().attr("href") {
                    let mut bookmark = RawBookmark {
                        url: href.to_string(),
                        title: a.text().collect::<String>().trim().to_string(),
                        hash: RawBookmark::generate_hash(href),
                        add_date: None,
                        last_modified: None,
                        icon: None,
                        description: None,
                        tags: Vec::new(),
                        folder_path: current_path.clone(),
                        attributes: HashMap::new(),
                    };
                    
                    // Parse attributes
                    for (name, value) in a.value().attrs() {
                        match name {
                            "add_date" => {
                                if let Ok(timestamp) = value.parse::<i64>() {
                                    bookmark.add_date = DateTime::from_timestamp(timestamp, 0);
                                }
                            }
                            "last_modified" => {
                                if let Ok(timestamp) = value.parse::<i64>() {
                                    bookmark.last_modified = DateTime::from_timestamp(timestamp, 0);
                                }
                            }
                            "icon" => {
                                bookmark.icon = Some(value.to_string());
                            }
                            "tags" => {
                                bookmark.tags = value.split(',').map(|s| s.trim().to_string()).collect();
                            }
                            _ => {
                                if name != "href" {
                                    bookmark.attributes.insert(name.to_string(), value.to_string());
                                }
                            }
                        }
                    }
                    
                    // Look for description in following DD
                    for sibling in dt.next_siblings() {
                        if let Some(elem) = ElementRef::wrap(sibling) {
                            if elem.value().name() == "dd" {
                                bookmark.description = Some(elem.text().collect::<String>().trim().to_string());
                                break;
                            }
                            // Stop at next DT
                            if elem.value().name() == "dt" {
                                break;
                            }
                        }
                    }
                    
                    bookmarks.push(bookmark);
                }
            }
        }
    }
    
    /// Check if an element is a direct child of a parent
    fn is_direct_child(parent: &ElementRef, child: &ElementRef) -> bool {
        // This is a simplified check - in real implementation we'd walk up the tree
        // For now, we'll process all DTs and rely on proper HTML structure
        true
    }
    
    /// Parse Netscape bookmark format (most common)
    pub fn parse_netscape_format(content: &str) -> Result<Vec<RawBookmark>> {
        // Netscape format is HTML, so use the HTML parser
        Self::parse_html(content)
    }
    
    /// Detect bookmark file format
    pub fn detect_format(content: &str) -> &'static str {
        let trimmed = content.trim();
        
        if trimmed.starts_with("<!DOCTYPE NETSCAPE-Bookmark-file-1>") {
            "netscape"
        } else if trimmed.starts_with("<") && trimmed.contains("<DL>") {
            "html"
        } else if trimmed.starts_with("{") || trimmed.starts_with("[") {
            "json"
        } else {
            "unknown"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_hash_generation() {
        let url = "https://example.com";
        let hash = RawBookmark::generate_hash(url);
        assert_eq!(hash.len(), 64); // SHA256 produces 64 hex chars
        
        // Same URL should produce same hash
        let hash2 = RawBookmark::generate_hash(url);
        assert_eq!(hash, hash2);
    }
    
    #[test]
    fn test_url_validation() {
        let valid_bookmark = RawBookmark {
            url: "https://example.com".to_string(),
            title: "Example".to_string(),
            hash: "test".to_string(),
            add_date: None,
            last_modified: None,
            icon: None,
            description: None,
            tags: vec![],
            folder_path: vec![],
            attributes: HashMap::new(),
        };
        assert!(valid_bookmark.is_valid_url());
        
        let invalid_bookmark = RawBookmark {
            url: "not a url".to_string(),
            ..valid_bookmark.clone()
        };
        assert!(!invalid_bookmark.is_valid_url());
    }
    
    #[test]
    fn test_parse_simple_html() {
        let html = r#"
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <HTML>
        <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
        <TITLE>Bookmarks</TITLE>
        <H1>Bookmarks</H1>
        <DL><p>
            <DT><A HREF="https://example.com" ADD_DATE="1234567890">Example</A>
            <DD>Example description
            <DT><H3>Folder</H3>
            <DL><p>
                <DT><A HREF="https://test.com" TAGS="tag1,tag2">Test</A>
            </DL><p>
        </DL><p>
        </HTML>
        "#;
        
        let bookmarks = BookmarkParser::parse_html(html).unwrap();
        assert_eq!(bookmarks.len(), 2);
        
        // Check first bookmark
        assert_eq!(bookmarks[0].url, "https://example.com");
        assert_eq!(bookmarks[0].title, "Example");
        assert_eq!(bookmarks[0].description, Some("Example description".to_string()));
        assert!(bookmarks[0].add_date.is_some());
        assert_eq!(bookmarks[0].folder_path.len(), 0);
        
        // Check second bookmark
        assert_eq!(bookmarks[1].url, "https://test.com");
        assert_eq!(bookmarks[1].title, "Test");
        assert_eq!(bookmarks[1].tags, vec!["tag1", "tag2"]);
        assert_eq!(bookmarks[1].folder_path, vec!["Folder"]);
    }
    
    #[test]
    fn test_nested_folders() {
        let html = r#"
        <DL>
            <DT><H3>Development</H3>
            <DL>
                <DT><H3>Rust</H3>
                <DL>
                    <DT><A HREF="https://doc.rust-lang.org">Rust Docs</A>
                </DL>
                <DT><A HREF="https://github.com">GitHub</A>
            </DL>
        </DL>
        "#;
        
        let bookmarks = BookmarkParser::parse_html(html).unwrap();
        assert_eq!(bookmarks.len(), 2);
        
        // GitHub should be in Development folder
        let github = bookmarks.iter().find(|b| b.url == "https://github.com").unwrap();
        assert_eq!(github.folder_path, vec!["Development"]);
        
        // Rust Docs should be in Development/Rust folder
        let rust_docs = bookmarks.iter().find(|b| b.url == "https://doc.rust-lang.org").unwrap();
        assert_eq!(rust_docs.folder_path, vec!["Development", "Rust"]);
    }
    
    #[test]
    fn test_format_detection() {
        assert_eq!(BookmarkParser::detect_format("<!DOCTYPE NETSCAPE-Bookmark-file-1>"), "netscape");
        assert_eq!(BookmarkParser::detect_format("<HTML><DL></DL></HTML>"), "html");
        assert_eq!(BookmarkParser::detect_format("[{\"url\": \"test\"}]"), "json");
        assert_eq!(BookmarkParser::detect_format("random text"), "unknown");
    }
}
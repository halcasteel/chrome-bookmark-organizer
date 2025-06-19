use chrono::{DateTime, Utc};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedBookmark {
    pub url: String,
    pub title: String,
    pub add_date: Option<DateTime<Utc>>,
    pub icon: Option<String>,
    pub tags: Vec<String>,
    pub folder_path: Vec<String>,
}

pub fn parse_bookmarks_html(content: &str) -> Vec<ParsedBookmark> {
    let document = Html::parse_document(content);
    let mut bookmarks = Vec::new();

    // Simple parser that just extracts all bookmarks without folder hierarchy
    // This is temporary - the real A2A import agent has proper folder support
    let a_selector = Selector::parse("a").unwrap();
    
    for element in document.select(&a_selector) {
        if let Some(href) = element.value().attr("href") {
            let title = element.text().collect::<String>().trim().to_string();
            
            let add_date = element.value().attr("add_date")
                .and_then(|ts| ts.parse::<i64>().ok())
                .and_then(|ts| DateTime::from_timestamp(ts, 0));
            
            let icon = element.value().attr("icon").map(|s| s.to_string());
            
            let tags = element.value().attr("tags")
                .map(|t| t.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default();
            
            bookmarks.push(ParsedBookmark {
                url: href.to_string(),
                title,
                add_date,
                icon,
                tags,
                folder_path: Vec::new(), // TODO: Extract folder hierarchy
            });
        }
    }
    
    bookmarks
}
//
//  ViewController.swift
//  InViewMaestro
//
//  Created by Eric Meyer on 1/23/17.
//  Copyright © 2017 Eric Meyer. All rights reserved.
//

import UIKit

class ViewController: UIViewController, UIWebViewDelegate {

    @IBOutlet weak var webView: UIWebView!
    @IBOutlet weak var menuView: UIView!
    @IBOutlet weak var fade: UIView!
    
    var isMenuShowing = false;
    var timer = Timer()
    
    struct Notification {
        var id = -1
        var message = ""
        var sent = ""
    }
    
    var notifications = [Notification]();
    
    override func viewDidLoad() {
        super.viewDidLoad()
        /*
         let selectedDate = sender.date
         print("Selected date: \(selectedDate)")
         let delegate = UIApplication.shared.delegate as? AppDelegate
         delegate?.scheduleNotification(at: selectedDate)
         */
        
        webView.isUserInteractionEnabled = true
        webView.scrollView.isScrollEnabled = true
        scheduledTimerWithTimeInterval()
        
        NotificationCenter.default.addObserver(self, selector: #selector(ViewController.rotated), name: NSNotification.Name.UIDeviceOrientationDidChange, object: nil)
        
        let maestroURL = URL(string: "http://v2.maestro.rmg.local/prt/login-inview.html");
        let maestroURLRequest = URLRequest(url: maestroURL!);
        webView.delegate = self;
        webView.loadRequest(maestroURLRequest);
        
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        fade.addGestureRecognizer(tap)
        
        let press = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress))
        webView.addGestureRecognizer(press)
        
        fade.alpha = 0.0
        let url = URL(string: "http://v2.maestro.rmg.local:8085/alerts?iid=230&last=-5")
        URLSession.shared.dataTask(with:url!, completionHandler: {(data, response, error) in
            guard let data = data, error == nil else { return }
            do {
                let response = try JSONSerialization.jsonObject(with: data, options: .allowFragments) as! NSArray
                for case let json as NSDictionary in response {
                    let id = (json["id"] as! NSString).intValue;
                    let message = json["message"];
                    let sent = json["sent"];
                    self.notifications.append(Notification(id: Int(id), message: message as! String, sent: sent as! String));
                }
            } catch let error as NSError {
                print(error)
            }
        }).resume()
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    func scheduledTimerWithTimeInterval(){
        timer = Timer.scheduledTimer(timeInterval: 1, target: self, selector: #selector(self.stopWebViewSelection), userInfo: nil, repeats: true)
    }
  
    func stopWebViewSelection() {
        //webView.resignFirstResponder();
        
        webView.stringByEvaluatingJavaScript(from: "document.documentElement.style.webkitUserSelect='none'")
        webView.stringByEvaluatingJavaScript(from: "document.documentElement.style.webkitTouchCallout='none'")
    }
    
    func webViewDidFinishLoad(_ webView: UIWebView) {
        self.stopWebViewSelection()
    }

    func rotated() {
        self.menuView.center.y = self.view.bounds.height / 2;
    }
    
    func gestureRecognizer(_: UIGestureRecognizer,  shouldRecognizeSimultaneouslyWithGestureRecognizer:UIGestureRecognizer) -> Bool
    {
        return true
    }
    
    override func viewWillAppear(_ animated: Bool) {
        menuView.center.y -= view.bounds.height
    }
    
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        if UIDevice.current.orientation.isLandscape {
            webView.scalesPageToFit = false
        } else {
            webView.scalesPageToFit = false
        }
    }
    
    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
    }
    
    func retreatMenu() {
        UIView.animate(withDuration: 1.0, delay: 0.0,
                       usingSpringWithDamping: 0.3,
                       initialSpringVelocity: 0.5,
                       options: [], animations: {
                        self.menuView.center.y = -self.view.bounds.height
        }, completion: nil)
        UIView.animate(withDuration: 0.25, delay: 0.0,
                       options: [],
                       animations: {
                        self.fade.alpha = 0.0
        }, completion: nil)
        isMenuShowing = false;
    }
    
    func showMenu() {
        if(!isMenuShowing) {
            isMenuShowing = true;
            self.menuView.center.y = -self.view.bounds.height
            UIView.animate(withDuration: 1.5, delay: 0.5,
                           usingSpringWithDamping: 0.3,
                           initialSpringVelocity: 0.5,
                           options: [], animations: {
                            self.menuView.center.y = self.view.bounds.height / 2;
            }, completion: nil)
            UIView.animate(withDuration: 0.5, delay: 1.0,
                           options: [],
                           animations: {
                            self.fade.alpha = 1.0
            }, completion: nil)
        }
    }
    
    func handleTap(gesture: UITapGestureRecognizer) {
        let view = gesture.view
        let loc = gesture.location(in: view)
        let subview = view?.hitTest(loc, with: nil)
        if(subview == fade) {
            retreatMenu()
        }
    }
    
    func handleLongPress(recognizer:UILongPressGestureRecognizer) {
        
        if(recognizer.state == UIGestureRecognizerState.began) {
            showMenu();
        }
    }
}


import * as R from 'ramda';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';
import { Http, Headers, RequestOptions, RequestMethod } from '@angular/http';
import { pathProxy } from 'proxy-dsl';
import { makeUrl, lookup, arr2obj } from '../js';

const METHODS = {
  get: RequestMethod.Get,
  post: RequestMethod.Post,
  put: RequestMethod.Put,
  delete: RequestMethod.Delete,
  patch: RequestMethod.Patch,
  head: RequestMethod.Head,
  options: RequestMethod.Options,
};

export type Rest<T> = {
  get: () => Observable<T[]>,
  post: (v: T) => Observable<T>,
  // TODO: allow extending
} & {
  [k: string]: {
    get: () => Observable<T>,
    put: (v: T) => Observable<T>,
    delete: () => Observable<void>,
    patch: (v: Partial<T>) => Observable<T>,
    // TODO: allow extending
  },
}

export interface ReqOpts {
  query?: { [k: string]: string };
}

// a service for dealing with JSON apis. set the domain/headers, type the api (-> $fooId for dynamic segments), then use with { fooId } to pass it in.

@Injectable()
export class ApiService<T> {
  domain = '';
  headers = () => ({});

  constructor(
    public http: Http,
  ) {}
    
  // angular http wrapper (low-level, see also req())
  fetch<T>(k: string, url: string, body: Object|null|string = '', query = {}): Observable<any> {
    let method = METHODS[k];
    let url_ = makeUrl(url, query);
    // assert.ok(url_);
    let headers = this.headers(); // this.buildRequestOptions();
    let options = new RequestOptions({ headers: new Headers(headers) });
    const BODY_METHODS = ['post', 'put', 'patch']; // get/delete/head
    let pars = R.contains(k, BODY_METHODS) ? [url_, body, options]: [url_, options];
    return this.http[k](...pars)
    // .retryWhen((attempts: Observable<any>) => Observable
    //   .range(1, 3).zip(attempts, R.identity)
    //   .flatMap((i: number) => Observable.timer(i * 1000))
    // )
    // // TODO: figure out how to make retry return last attempt if all fail
    // // TODO: better judge whether the issue merits a retry
  }

  req = R.map(<F extends (url: string, bodyOrQuery: {}, opts: {}) => Observable<Response>>(fn: F) => R.pipe(fn, /*R*/(obs: Observable<Response>) => obs.map((resp: Response) => resp.json())))(
    R.merge(
      arr2obj((k: string) => (url: string, pars = {}, opts: ReqOpts = {}) => this.fetch(k, `${this.domain}/${url}`, null,       pars))(['get','delete','head','options']),
      arr2obj((k: string) => (url: string, pars = {}, opts: ReqOpts = {}) => this.fetch(k, `${this.domain}/${url}`, pars, opts.query))(['put','post','patch']),
    )
  )

  api: T = pathProxy((segments: Array<string|number>, pars?: { [k: string]: string }, opts?: Object) => {
    let [urlPath, verb]: [Array<string|number>, string] = [R.init(segments), <string>R.last(segments)];
    let dynamicSegments = R.pipe(R.filter(R.test(/^$/)), R.map(R.tail))(urlPath);
    let [pathPars, miscPars] = R.addIndex(R.partition)((v, k) => R.contains(k, <string[]>dynamicSegments))(pars || {});
    let mappedPath = urlPath.map(R.when(R.test(/^$/), lookup(pathPars)));
    return this.req[verb](mappedPath.join('/'), miscPars, opts);
  });

}
